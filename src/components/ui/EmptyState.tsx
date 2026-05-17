import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bati-card rounded-lg p-10 flex flex-col items-center text-center">
      {icon && (
        <div className="mb-4 w-12 h-12 rounded-full bg-bati-teal-soft text-bati-teal flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-bati-text">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-bati-muted max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
