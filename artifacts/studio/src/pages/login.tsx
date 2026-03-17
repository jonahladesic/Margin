import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";

export default function Login() {
  const { login } = useAuth();

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 rounded-xl border border-border bg-card shadow-lg text-center">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-primary mb-2">Studio OS</h1>
          <p className="text-muted-foreground text-lg">Bespoke studio management.</p>
        </div>
        
        <Button size="lg" className="w-full" onClick={login}>
          Log In to Studio OS
        </Button>
      </div>
    </div>
  );
}
