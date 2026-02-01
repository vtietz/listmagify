import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Redirecting...',
};

/**
 * Stats Page - Redirects to Admin
 * 
 * The stats page has been renamed to admin.
 * This redirect ensures old bookmarks and links continue to work.
 */
export default function StatsPage() {
  redirect('/admin');
}
