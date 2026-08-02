import { ProfileDashboard } from "@/features/perfil/ui/profile-dashboard";

const ProfilePage = () => {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-2 md:p-4 md:pl-0 h-screen">
      <ProfileDashboard usuario={{ id: "", nombre: "", email: "", plan: "" }} />
    </div>
  );
};

export default ProfilePage;
