import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  useSession,
  useListOrganizations,
  organization,
} from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Building2, Plus, Check } from "lucide-react";

export const Route = createFileRoute("/select-org")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login" });
    }
  },
  component: SelectOrganization,
});

export function SelectOrganization() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading } = useSession();
  const { data: orgs, isPending: orgsLoading } = useListOrganizations();
  const [newOrgName, setNewOrgName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  // Redirect if not authenticated
  useEffect(() => {
    if (!sessionLoading && !session?.user) {
      navigate({ to: "/login" });
    }
  }, [session, sessionLoading, navigate]);

  const handleSelectOrg = async (orgId: string) => {
    try {
      await organization.setActive({ organizationId: orgId });
      navigate({ to: "/dashboard" });
    } catch {
      setError("Failed to select organization");
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setIsCreating(true);
    setError("");

    try {
      const newOrg = await organization.create({
        name: newOrgName.trim(),
        slug: newOrgName.trim().toLowerCase().replace(/\s+/g, "-"),
      });

      if (newOrg.data) {
        await organization.setActive({ organizationId: newOrg.data.id });
        navigate({ to: "/dashboard" });
      }
    } catch {
      setError("Failed to create organization");
    } finally {
      setIsCreating(false);
    }
  };

  if (sessionLoading || orgsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Select Organization</h1>
          <p className="text-muted-foreground mt-2">
            Choose an organization to continue
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
            {error}
          </div>
        )}

        {orgs && orgs.length > 0 && (
          <div className="space-y-3">
            {orgs.map((org) => (
              <Card
                key={org.id}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleSelectOrg(org.id)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {org.slug}
                      </p>
                    </div>
                  </div>
                  <Check className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {orgs && orgs.length > 0 && (
          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
              OR
            </span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Organization
            </CardTitle>
            <CardDescription>
              Start a new organization for your team
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="My Company"
                  disabled={isCreating}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isCreating || !newOrgName.trim()}
              >
                {isCreating ? "Creating..." : "Create Organization"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
