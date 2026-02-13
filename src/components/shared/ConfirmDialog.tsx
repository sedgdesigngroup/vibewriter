"use client";

interface ConfirmDialogProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ isOpen, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl">
        <p className="text-white text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            아니오
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-medium transition-colors"
          >
            네
          </button>
        </div>
      </div>
    </div>
  );
}
