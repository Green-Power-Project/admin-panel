'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AppHeader from '@/components/AppHeader';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore';

interface ReportApproval {
  id: string;
  projectId: string;
  customerId: string;
  filePath: string;
  status: 'pending' | 'approved' | 'auto-approved';
  approvedAt?: Timestamp;
  uploadedAt?: Timestamp;
  autoApproveDate?: Timestamp;
}

interface ReportApprovalDisplay {
  id: string;
  fileName: string;
  filePath: string;
  projectId: string;
  projectName: string;
  customerId: string;
  customerNumber?: string;
  customerEmail?: string;
  status: 'pending' | 'approved' | 'auto-approved';
  approvedAt?: Timestamp;
  uploadedAt?: Timestamp;
  autoApproveDate?: Timestamp;
}

export default function ApprovalsPage() {
  return (
    <ProtectedRoute>
      <ApprovalsContent />
    </ProtectedRoute>
  );
}

function ApprovalsContent() {
  const [approvals, setApprovals] = useState<ReportApprovalDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadProjects();
    loadApprovals();
  }, []);

  useEffect(() => {
    loadApprovals();
  }, [filterProject, filterStatus]);

  async function loadProjects() {
    try {
      const q = query(collection(db, 'projects'), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const projectsList: Array<{ id: string; name: string }> = [];
      snapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, name: doc.data().name });
      });
      setProjects(projectsList);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  async function loadApprovals() {
    setLoading(true);
    try {
      // Load all report approvals
      let q;
      if (filterStatus === 'all') {
        q = query(collection(db, 'reportApprovals'), orderBy('uploadedAt', 'desc'));
      } else {
        q = query(
          collection(db, 'reportApprovals'),
          where('status', '==', filterStatus),
          orderBy('uploadedAt', 'desc')
        );
      }

      const snapshot = await getDocs(q);
      const approvalsList: ReportApproval[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (filterProject === 'all' || data.projectId === filterProject) {
          approvalsList.push({
            id: doc.id,
            ...data,
          } as ReportApproval);
        }
      });

      // Load projects and customers for enrichment
      const projectsSnapshot = await getDocs(collection(db, 'projects'));
      const projectsMap = new Map<string, string>();
      projectsSnapshot.forEach((doc) => {
        projectsMap.set(doc.id, doc.data().name);
      });

      const customersSnapshot = await getDocs(collection(db, 'customers'));
      const customersMap = new Map<string, { customerNumber: string; email: string }>();
      customersSnapshot.forEach((doc) => {
        const data = doc.data();
        customersMap.set(data.uid, {
          customerNumber: data.customerNumber || 'N/A',
          email: data.email || 'N/A',
        });
      });

      // Enrich approvals with project and customer info
      const enrichedApprovals: ReportApprovalDisplay[] = approvalsList.map((approval) => {
        const customerInfo = customersMap.get(approval.customerId);
        return {
          ...approval,
          fileName: approval.filePath.split('/').pop() || approval.filePath,
          projectName: projectsMap.get(approval.projectId) || 'Unknown Project',
          customerNumber: customerInfo?.customerNumber,
          customerEmail: customerInfo?.email,
        };
      });

      setApprovals(enrichedApprovals);
    } catch (error) {
      console.error('Error loading approvals:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(timestamp?: Timestamp): string {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate();
    return date.toLocaleString();
  }

  function getStatusBadge(status: string) {
    const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    if (status === 'approved') {
      return `${baseClasses} bg-green-100 text-green-800`;
    } else if (status === 'auto-approved') {
      return `${baseClasses} bg-blue-100 text-blue-800`;
    } else if (status === 'pending') {
      return `${baseClasses} bg-yellow-100 text-yellow-800`;
    }
    return `${baseClasses} bg-gray-100 text-gray-800`;
  }

  function getStatusLabel(status: string): string {
    if (status === 'approved') return '✓ Approved';
    if (status === 'auto-approved') return '✓ Auto-Approved';
    if (status === 'pending') return '● Pending';
    return status;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Work Report Approvals</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor report approval status and dates</p>
        </div>

        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Project
            </label>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
            >
              <option value="all">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="auto-approved">Auto-Approved</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <div className="inline-block h-6 w-6 border-2 border-gray-300 border-t-green-power-500 rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500">Loading approvals...</p>
          </div>
        ) : approvals.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-sm p-12 text-center">
            <p className="text-sm text-gray-500">No report approvals found.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Report File
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Approval Date & Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {approvals.map((approval) => (
                  <tr key={approval.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{approval.fileName}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5 truncate max-w-xs">
                        {approval.filePath}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{approval.projectName}</div>
                      <div className="text-xs text-gray-500 font-mono">{approval.projectId.slice(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{approval.customerNumber || 'N/A'}</div>
                      <div className="text-xs text-gray-500">{approval.customerEmail || 'N/A'}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">{approval.customerId.slice(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={getStatusBadge(approval.status)}>
                        {getStatusLabel(approval.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {approval.approvedAt ? (
                        <div className="text-sm text-gray-900">{formatDate(approval.approvedAt)}</div>
                      ) : approval.status === 'pending' && approval.autoApproveDate ? (
                        <div>
                          <div className="text-sm text-gray-500">Auto-approve:</div>
                          <div className="text-xs text-gray-400">{formatDate(approval.autoApproveDate)}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not approved yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-sm p-4">
          <p className="text-xs text-blue-800 font-medium mb-1">📋 Approval Rules</p>
          <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
            <li>Customer can approve/acknowledge reports manually</li>
            <li>If no objection within 5 working days, reports are auto-approved</li>
            <li>Email notifications are sent on upload and auto-approval</li>
            <li>Admin can view report status and approval date & time</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
