import ProfilePage from '@/app/dashboard/profile/page';

export default function ManufacturingProfilePage() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-sm">
        <span className="font-semibold">Business Mode:</span> Manufacturing
      </div>
      <ProfilePage />
    </div>
  );
}
