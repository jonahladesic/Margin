import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  meetingsTable,
  meetingAttendeesTable,
  timeBlocksTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, gte, lte, or, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { generateRecurrenceDates } from "../lib/recurrence";

const router: IRouter = Router();

async function formatMeeting(m: typeof meetingsTable.$inferSelect) {
  const organizer = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, m.organizerId))
    .limit(1);

  const attendees = await db
    .select()
    .from(meetingAttendeesTable)
    .where(eq(meetingAttendeesTable.meetingId, m.id));

  const attendeeUsers = attendees.length > 0
    ? await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, attendees.map((a) => a.userId)))
    : [];

  return {
    id: m.id,
    title: m.title,
    description: m.description,
    organizerId: m.organizerId,
    organizerName: organizer[0]
      ? `${organizer[0].firstName ?? ""} ${organizer[0].lastName ?? ""}`.trim() || organizer[0].username
      : "Unknown",
    date: m.date,
    startTime: parseFloat(m.startTime),
    hours: parseFloat(m.hours),
    zoomLink: m.zoomLink,
    status: m.status,
    recurrenceRule: m.recurrenceRule,
    seriesId: m.seriesId,
    attendees: attendees.map((a) => {
      const user = attendeeUsers.find((u) => u.id === a.userId);
      return {
        id: a.id,
        userId: a.userId,
        userName: user
          ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.username
          : "Unknown",
        status: a.status,
        timeBlockId: a.timeBlockId,
      };
    }),
    createdAt: m.createdAt.toISOString(),
  };
}

// GET /api/meetings - list meetings for a date range
router.get("/meetings", async (req, res) => {
  const { startDate, endDate, userId } = req.query as Record<string, string>;
  const conditions = [];
  if (startDate) conditions.push(gte(meetingsTable.date, startDate));
  if (endDate) conditions.push(lte(meetingsTable.date, endDate));

  let meetings = await db
    .select()
    .from(meetingsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(meetingsTable.date);

  // If userId filter, include meetings where user is organizer or attendee
  if (userId) {
    const attendeeRecords = await db
      .select()
      .from(meetingAttendeesTable)
      .where(eq(meetingAttendeesTable.userId, userId));
    const attendeeMeetingIds = new Set(attendeeRecords.map((a) => a.meetingId));

    meetings = meetings.filter(
      (m) => m.organizerId === userId || attendeeMeetingIds.has(m.id)
    );
  }

  const result = await Promise.all(meetings.map(formatMeeting));
  res.json(result);
});

// POST /api/meetings - create a meeting
router.post("/meetings", async (req, res) => {
  const {
    title,
    description,
    organizerId,
    date,
    startTime,
    hours,
    zoomLink,
    attendeeIds,
    recurrenceRule,
    projectId,
  } = req.body;

  if (!title || !organizerId || !date || startTime == null || hours == null) {
    res.status(400).json({ error: "title, organizerId, date, startTime, and hours are required" });
    return;
  }

  const seriesId = recurrenceRule ? randomUUID() : null;

  // Create the meeting
  const [meeting] = await db
    .insert(meetingsTable)
    .values({
      id: randomUUID(),
      title,
      description: description || null,
      organizerId,
      date,
      startTime: String(startTime),
      hours: String(hours),
      zoomLink: zoomLink || null,
      status: "scheduled",
      recurrenceRule: recurrenceRule || null,
      seriesId,
    })
    .returning();

  // Create timeblocks for each attendee (and organizer)
  const allParticipants = new Set<string>([organizerId, ...(attendeeIds || [])]);

  for (const userId of allParticipants) {
    const timeBlockId = randomUUID();

    // Create timeblock on this user's calendar
    await db.insert(timeBlocksTable).values({
      id: timeBlockId,
      userId,
      projectId: projectId || organizerId, // fallback — meetings need a project context
      date,
      hours: String(hours),
      startTime: String(startTime),
      type: "meeting",
      title,
      description: zoomLink ? `Zoom: ${zoomLink}` : description || null,
      approved: false,
      meetingId: meeting.id,
      recurrenceRule: recurrenceRule || null,
      seriesId,
    });

    // Create attendee record
    if (userId !== organizerId) {
      await db.insert(meetingAttendeesTable).values({
        id: randomUUID(),
        meetingId: meeting.id,
        userId,
        timeBlockId,
        status: "pending",
      });
    }
  }

  // If recurring, create future instances
  if (recurrenceRule && seriesId) {
    const futureDates = generateRecurrenceDates(date, recurrenceRule);
    for (const futureDate of futureDates) {
      const [futureMeeting] = await db
        .insert(meetingsTable)
        .values({
          id: randomUUID(),
          title,
          description: description || null,
          organizerId,
          date: futureDate,
          startTime: String(startTime),
          hours: String(hours),
          zoomLink: zoomLink || null,
          status: "scheduled",
          recurrenceRule,
          seriesId,
        })
        .returning();

      for (const userId of allParticipants) {
        const timeBlockId = randomUUID();
        await db.insert(timeBlocksTable).values({
          id: timeBlockId,
          userId,
          projectId: projectId || organizerId,
          date: futureDate,
          hours: String(hours),
          startTime: String(startTime),
          type: "meeting",
          title,
          description: zoomLink ? `Zoom: ${zoomLink}` : description || null,
          approved: false,
          meetingId: futureMeeting.id,
          recurrenceRule,
          seriesId,
        });

        if (userId !== organizerId) {
          await db.insert(meetingAttendeesTable).values({
            id: randomUUID(),
            meetingId: futureMeeting.id,
            userId,
            timeBlockId,
            status: "pending",
          });
        }
      }
    }
  }

  res.status(201).json(await formatMeeting(meeting));
});

// PUT /api/meetings/:id - update a meeting
router.put("/meetings/:id", async (req, res) => {
  const { title, description, date, startTime, hours, zoomLink, status } = req.body;

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (date !== undefined) updateData.date = date;
  if (startTime !== undefined) updateData.startTime = String(startTime);
  if (hours !== undefined) updateData.hours = String(hours);
  if (zoomLink !== undefined) updateData.zoomLink = zoomLink;
  if (status !== undefined) updateData.status = status;

  const [updated] = await db
    .update(meetingsTable)
    .set(updateData)
    .where(eq(meetingsTable.id, req.params.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  // Sync linked timeblocks
  const attendees = await db
    .select()
    .from(meetingAttendeesTable)
    .where(eq(meetingAttendeesTable.meetingId, req.params.id));

  const timeBlockIds = attendees.map((a) => a.timeBlockId).filter(Boolean) as string[];

  // Also find organizer's timeblock
  const orgBlocks = await db
    .select()
    .from(timeBlocksTable)
    .where(and(eq(timeBlocksTable.meetingId, req.params.id)));

  const allBlockIds = [...new Set([...timeBlockIds, ...orgBlocks.map((b) => b.id)])];

  if (allBlockIds.length > 0) {
    const tbUpdate: Record<string, any> = { updatedAt: new Date() };
    if (date !== undefined) tbUpdate.date = date;
    if (startTime !== undefined) tbUpdate.startTime = String(startTime);
    if (hours !== undefined) tbUpdate.hours = String(hours);
    if (title !== undefined) tbUpdate.title = title;

    await db
      .update(timeBlocksTable)
      .set(tbUpdate)
      .where(inArray(timeBlocksTable.id, allBlockIds));
  }

  res.json(await formatMeeting(updated));
});

// DELETE /api/meetings/:id - delete a meeting
router.delete("/meetings/:id", async (req, res) => {
  const scope = (req.query.scope as string) || "single";

  const [meeting] = await db
    .select()
    .from(meetingsTable)
    .where(eq(meetingsTable.id, req.params.id));

  if (!meeting) {
    res.status(404).json({ error: "Meeting not found" });
    return;
  }

  if ((scope === "all" || scope === "future") && meeting.seriesId) {
    const conditions = [eq(meetingsTable.seriesId, meeting.seriesId)];
    if (scope === "future") {
      conditions.push(gte(meetingsTable.date, meeting.date));
    }

    // Get all meetings in scope
    const meetingsToDelete = await db
      .select()
      .from(meetingsTable)
      .where(and(...conditions));

    const meetingIds = meetingsToDelete.map((m) => m.id);

    if (meetingIds.length > 0) {
      // Delete attendees
      await db
        .delete(meetingAttendeesTable)
        .where(inArray(meetingAttendeesTable.meetingId, meetingIds));

      // Delete linked timeblocks
      await db
        .delete(timeBlocksTable)
        .where(inArray(timeBlocksTable.meetingId, meetingIds));

      // Delete meetings
      await db
        .delete(meetingsTable)
        .where(inArray(meetingsTable.id, meetingIds));
    }
  } else {
    // Single delete
    await db
      .delete(meetingAttendeesTable)
      .where(eq(meetingAttendeesTable.meetingId, meeting.id));

    await db
      .delete(timeBlocksTable)
      .where(eq(timeBlocksTable.meetingId, meeting.id));

    await db
      .delete(meetingsTable)
      .where(eq(meetingsTable.id, meeting.id));
  }

  res.status(204).send();
});

export default router;
