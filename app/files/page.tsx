import { redirect } from 'next/navigation';

/**
 * Files screen has been removed. Redirect to Projects.
 */
export default function FilesPage() {
  redirect('/projects');
}
