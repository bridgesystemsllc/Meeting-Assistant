"use client";

import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { JoinMeetingModal } from "@/components/dashboard/JoinMeetingModal";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [showJoinModal, setShowJoinModal] = useState(false);
  return (
    <div className="min-h-screen">
      <Sidebar onJoinMeeting={() => setShowJoinModal(true)} />
      <main className="lg:ml-60 pb-20 lg:pb-0">
        <div className="max-w-6xl mx-auto p-6">{children}</div>
      </main>
      <JoinMeetingModal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)} />
    </div>
  );
}
