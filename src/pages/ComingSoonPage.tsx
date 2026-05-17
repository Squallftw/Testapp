import { EmptyState } from '@/components/ui/EmptyState';

interface ComingSoonPageProps {
  feature: string;
  /** Optional milestone label, e.g. "M2". */
  milestone?: string;
}

/**
 * Placeholder for routes whose feature has not yet been ported.
 * Navigation works, sidebar highlights correctly, no DAL call is made.
 */
export default function ComingSoonPage({ feature, milestone }: ComingSoonPageProps) {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <EmptyState
        title={feature}
        description={
          milestone
            ? `Cette section arrive avec la livraison ${milestone}.`
            : 'Cette section arrive bientôt.'
        }
        icon={
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        }
      />
    </div>
  );
}
