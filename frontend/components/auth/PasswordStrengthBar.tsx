'use client';

import React from 'react';

interface PasswordStrengthBarProps {
  password?: string;
}

export function PasswordStrengthBar({ password = '' }: PasswordStrengthBarProps) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  let label = 'Weak';
  let color = 'bg-red-500';
  let width = 'w-1/4';

  if (score === 2) {
    label = 'Fair';
    color = 'bg-yellow-500';
    width = 'w-2/4';
  } else if (score === 3) {
    label = 'Good';
    color = 'bg-blue-500';
    width = 'w-3/4';
  } else if (score >= 4) {
    label = 'Strong';
    color = 'bg-green-500';
    width = 'w-full';
  }

  if (!password) return null;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>Password Strength</span>
        <span className="font-semibold">{label}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} ${width} transition-all duration-300`} />
      </div>
    </div>
  );
}
