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
import { Switch } from "@/components/ui/switch";
import { useUserAuthStore } from "@/stores/userAuth";
import {
  Shield,
  Infinity as InfinityIcon,
  Users,
  Coins,
  Trash2,
  PlusCircle,
  CheckCircle2,
  Lock,
} from "lucide-react";

interface AdminDashboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminDashboard({ open, onOpenChange }: AdminDashboardProps) {
  const {
    currentUser,
    users,
    globalUnlimitedCredits,
    adminSetGlobalUnlimited,
    adminToggleUnlimited,
    adminSetCredits,
    adminGiveSelfCredits,
    adminDeleteUser,
    login,
  } = useUserAuthStore();

  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>({});
  const [selfCreditAdd, setSelfCreditAdd] = useState("500");

  const isAdmin = currentUser?.role === "admin";

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = login("admin", adminPasswordInput);
    if (!res.success) {
      setAuthError(res.error || "Invalid credentials");
    }
  };

  const handleUpdateCredits = (userId: string) => {
    const val = parseInt(creditAmounts[userId] || "0", 10);
    if (!isNaN(val)) {
      adminSetCredits(userId, val);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg flex items-center gap-2">
                Admin Control Dashboard
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
                  Master Control
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Manage all user balances, toggle unlimited credits globally, and allocate agent quotas.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!isAdmin ? (
          <div className="py-8 flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Admin Login Required</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Enter master admin password to access administrator features (Default: <code className="bg-muted px-1 py-0.5 rounded text-foreground">admin</code>).
              </p>
            </div>
            <form onSubmit={handleAdminAuth} className="w-full space-y-3">
              <Input
                type="password"
                placeholder="Enter admin password (admin)"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                autoFocus
              />
              {authError && (
                <p className="text-xs text-destructive">{authError}</p>
              )}
              <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                Unlock Dashboard
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-6 pt-4 pr-1">
            {/* Quick Master Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Global Unlimited Toggle */}
              <div className="p-4 rounded-xl border bg-card flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <InfinityIcon className="w-4 h-4 text-primary" />
                    <h4 className="font-medium text-sm">Global Unlimited Credits</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When enabled, all users can prompt AI without consuming any credits.
                  </p>
                </div>
                <Switch
                  checked={globalUnlimitedCredits}
                  onCheckedChange={adminSetGlobalUnlimited}
                />
              </div>

              {/* Give Self Credits */}
              <div className="p-4 rounded-xl border bg-card flex flex-col justify-between gap-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-500" />
                    <h4 className="font-medium text-sm">Give Self Credits</h4>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-500">
                    Current: {currentUser.unlimitedCredits ? "∞ Unlimited" : currentUser.credits}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={selfCreditAdd}
                    onChange={(e) => setSelfCreditAdd(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="Amount"
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-black font-medium gap-1"
                    onClick={() => {
                      const val = parseInt(selfCreditAdd, 10);
                      if (!isNaN(val)) adminGiveSelfCredits(val);
                    }}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Add Credits
                  </Button>
                </div>
              </div>
            </div>

            {/* Users Management Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Registered Users ({users.length})
                </h4>
              </div>

              <div className="border rounded-xl overflow-hidden bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 text-muted-foreground uppercase font-medium border-b text-[10px]">
                      <tr>
                        <th className="px-4 py-2.5">User</th>
                        <th className="px-4 py-2.5">Role</th>
                        <th className="px-4 py-2.5">Unlimited Mode</th>
                        <th className="px-4 py-2.5">Credits Balance</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                              {u.username.slice(0, 2).toUpperCase()}
                            </div>
                            <span>{u.username}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                u.role === "admin"
                                  ? "bg-amber-500/20 text-amber-500 border border-amber-500/30"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {u.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={u.unlimitedCredits}
                                onCheckedChange={(checked) => adminToggleUnlimited(u.id, checked)}
                              />
                              <span className="text-[11px] text-muted-foreground">
                                {u.unlimitedCredits ? "Unlimited" : "Metered"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                className="h-7 w-24 text-xs font-mono"
                                defaultValue={u.credits}
                                onChange={(e) =>
                                  setCreditAmounts((prev) => ({
                                    ...prev,
                                    [u.id]: e.target.value,
                                  }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleUpdateCredits(u.id)}
                              >
                                Save
                              </Button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {u.role !== "admin" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => adminDeleteUser(u.id)}
                                title="Delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
