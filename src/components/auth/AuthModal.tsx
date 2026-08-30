import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useUserAuthStore } from "@/stores/userAuth";
import { Shield, Sparkles, User, Key, CheckCircle, AlertCircle, LogOut } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAdmin?: () => void;
}

export function AuthModal({ open, onOpenChange, onOpenAdmin }: AuthModalProps) {
  const { currentUser, login, register, logout } = useUserAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const res = login(username, password);
    if (!res.success) {
      setError(res.error || "Failed to login");
    } else {
      setSuccess("Logged in successfully!");
      setTimeout(() => {
        onOpenChange(false);
        setError(null);
        setSuccess(null);
      }, 500);
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const res = register(username, password);
    if (!res.success) {
      setError(res.error || "Failed to register");
    } else {
      setSuccess("Registered and logged in with bonus credits!");
      setTimeout(() => {
        onOpenChange(false);
        setError(null);
        setSuccess(null);
      }, 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle>Account & Credits</DialogTitle>
              <DialogDescription className="text-xs">
                Manage your user session, AI agent credits, and admin tools
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {currentUser ? (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl border bg-card flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm">
                    {currentUser.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm flex items-center gap-1.5">
                      {currentUser.username}
                      {currentUser.role === "admin" && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
                          ADMIN
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Status: {currentUser.unlimitedCredits ? "Unlimited AI Credits" : `${currentUser.credits} Credits`}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xl font-bold text-primary">
                    {currentUser.unlimitedCredits ? "∞" : currentUser.credits}
                  </span>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Credits</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs text-muted-foreground">
                <div>Role: <span className="font-medium text-foreground capitalize">{currentUser.role}</span></div>
                <div>Plan: <span className="font-medium text-foreground">{currentUser.unlimitedCredits ? "Unlimited Pass" : "Standard"}</span></div>
              </div>
            </div>

            <div className="flex gap-2">
              {currentUser.role === "admin" && onOpenAdmin && (
                <Button
                  className="flex-1 gap-2"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenAdmin();
                  }}
                >
                  <Shield className="w-4 h-4 text-amber-500" />
                  Admin Dashboard
                </Button>
              )}
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                onClick={() => logout()}
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-4">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            {error && (
              <div className="mb-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="mb-3 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Username
                  </label>
                  <Input
                    placeholder="e.g. admin or your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" /> Password
                  </label>
                  <Input
                    type="password"
                    placeholder="Enter password (default: admin)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full mt-2">
                  Sign In
                </Button>
                <p className="text-[11px] text-center text-muted-foreground mt-2">
                  Admin Credentials: <span className="font-mono text-foreground">admin</span> / <span className="font-mono text-foreground">admin</span>
                </p>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> New Username
                  </label>
                  <Input
                    placeholder="Choose a username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" /> Password (Optional)
                  </label>
                  <Input
                    type="password"
                    placeholder="Choose a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full mt-2">
                  Create Account & Get 100 Credits
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
