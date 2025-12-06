import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { Layout } from "@/components/layout/layout";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: ({ context }) => {
    if (context.auth.isLoading) {
      return;
    }
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login" });
    }
    if (!context.auth.hasOrganization) {
      throw redirect({ to: "/select-org" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
