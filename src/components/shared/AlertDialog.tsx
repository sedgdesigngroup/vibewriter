"use client";

interface AlertDialogProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

export default function AlertDialog({ isOpen, message, onClose }: AlertDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl">
        <p className="text-white text-center mb-6">{message}</p>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-medium transition-colors"
        >
          확인
        </button>
      </div>
    </div>
  );
}
