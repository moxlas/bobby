import React from 'react';
import { Button } from './ui/button';

interface ConfirmPopupProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmPopup({ message, onConfirm, onCancel }: ConfirmPopupProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-emerald-800 rounded-lg p-6 max-w-sm w-full mx-4 border border-emerald-600 shadow-2xl">
        <h3 className="text-lg font-bold text-amber-300 mb-4">Confirm Move</h3>
        <p className="text-emerald-100 mb-6">{message}</p>
        <div className="flex gap-3">
          <Button onClick={onConfirm} className="flex-1 bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold">
            Confirm
          </Button>
          <Button onClick={onCancel} variant="outline" className="flex-1 bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}