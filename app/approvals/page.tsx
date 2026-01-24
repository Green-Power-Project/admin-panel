'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
  getDocs,
} from 'firebase/firestore';
import Pagination from '@/components/Pagination';

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
      <AdminLayout title="Report Approvals">
        <ApprovalsContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function ApprovalsContent() {
  const [allApprovals, setAllApprovals] = useState<ReportApprovalDisplay[]>([]);
  const [approvals, setApprovals] = useState<ReportApprovalDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>(''); // customer/project/file search
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  // Store raw approvals and maps separately so we can re-enrich when maps update
  const [rawApprovals, setRawApprovals] = useState<ReportApproval[]>([]);
  const [projectsMap, setProjectsMap] = useState<Map<string, string>>(new Map());
  const [customersMap, setCustomersMap] = useState<Map<string, { customerNumber: string; email: string }>>(new Map());

  useEffect(() => {
    if (!db) return;

    // Real-time listener for projects
    const projectsUnsubscribe = onSnapshot(
      query(collection(db, 'projects'), orderBy('name', 'asc')),
      (snapshot) => {
        const projectsList: Array<{ id: string; name: string }> = [];
        snapshot.forEach((doc) => {
          projectsList.push({ id: doc.id, name: doc.data().name });
        });
        setProjects(projectsList);
      },
      (error) => {
        console.error('Error listening to projects:', error);
      }
    );

    // Cleanup listener on unmount
    return () => {
      projectsUnsubscribe();
    };
  }, []);

  // Real-time listener for report approvals - store raw data
  useEffect(() => {
    if (!db) return;

    const approvalsQuery = query(collection(db, 'reportApprovals'));
    
    const approvalsUnsubscribe = onSnapshot(
      approvalsQuery,
      (snapshot) => {
        console.log('Report approvals snapshot received:', snapshot.size, 'documents');
        const approvalsList: ReportApproval[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          const approval = {
            id: doc.id,
            ...data,
          } as ReportApproval;
          approvalsList.push(approval);
          // Log ALL approvals for debugging
          console.log('Approval document:', { 
            id: doc.id, 
            filePath: approval.filePath, 
            status: approval.status,
            projectId: approval.projectId,
            customerId: approval.customerId,
            approvedAt: approval.approvedAt?.toDate(),
            uploadedAt: approval.uploadedAt?.toDate()
          });
        });
        
        // Sort manually by approvedAt (most recent first), then uploadedAt, then by status priority
        approvalsList.sort((a, b) => {
          // First, prioritize by status: approved/auto-approved > pending
          const aStatusPriority = (a.status === 'approved' || a.status === 'auto-approved') ? 2 : 1;
          const bStatusPriority = (b.status === 'approved' || b.status === 'auto-approved') ? 2 : 1;
          if (aStatusPriority !== bStatusPriority) {
            return bStatusPriority - aStatusPriority; // Higher priority first
          }
          
          // If same priority, sort by timestamp (most recent first)
          const aTime = a.approvedAt?.toMillis() || a.uploadedAt?.toMillis() || 0;
          const bTime = b.approvedAt?.toMillis() || b.uploadedAt?.toMillis() || 0;
          return bTime - aTime; // Descending
        });

        setRawApprovals(approvalsList);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to report approvals:', error);
        setLoading(false);
      }
    );

    return () => {
      approvalsUnsubscribe();
    };
  }, []);

  // Real-time listener for projects
  useEffect(() => {
    if (!db) return;

    const projectsUnsubscribe = onSnapshot(
      collection(db, 'projects'),
      (snapshot) => {
        const newProjectsMap = new Map<string, string>();
        snapshot.forEach((doc) => {
          newProjectsMap.set(doc.id, doc.data().name);
        });
        setProjectsMap(newProjectsMap);
      },
      (error) => {
        console.error('Error listening to projects:', error);
      }
    );

    return () => {
      projectsUnsubscribe();
    };
  }, []);

  // Real-time listener for customers
  useEffect(() => {
    if (!db) return;

    const customersUnsubscribe = onSnapshot(
      collection(db, 'customers'),
      (snapshot) => {
        const newCustomersMap = new Map<string, { customerNumber: string; email: string }>();
        snapshot.forEach((doc) => {
          const data = doc.data();
          newCustomersMap.set(data.uid, {
            customerNumber: data.customerNumber || 'N/A',
            email: data.email || 'N/A',
          });
        });
        setCustomersMap(newCustomersMap);
      },
      (error) => {
        console.error('Error listening to customers:', error);
      }
    );

    return () => {
      customersUnsubscribe();
    };
  }, []);

  // Enrich and deduplicate approvals whenever rawApprovals, projectsMap, or customersMap changes
  useEffect(() => {
    // Enrich approvals with project and customer info
    const enrichedApprovals: ReportApprovalDisplay[] = rawApprovals.map((approval) => {
      const customerInfo = customersMap.get(approval.customerId);
      return {
        ...approval,
        fileName: approval.filePath.split('/').pop() || approval.filePath,
        projectName: projectsMap.get(approval.projectId) || 'Unknown Project',
        customerNumber: customerInfo?.customerNumber,
        customerEmail: customerInfo?.email,
      };
    });

    // Deduplicate: if multiple documents exist for same file, keep the one with highest priority status
    // Priority: approved/auto-approved > pending
    // Also handle cases where filePath might differ slightly (normalize for comparison)
    const deduplicatedMap = new Map<string, ReportApprovalDisplay>();
    enrichedApprovals.forEach((approval) => {
      // Normalize filePath for comparison (handle variations in path format)
      const normalizedPath = approval.filePath.split('/').pop() || approval.filePath;
      const key = `${approval.projectId}_${approval.customerId}_${normalizedPath}`;
      const existing = deduplicatedMap.get(key);
      
      if (!existing) {
        deduplicatedMap.set(key, approval);
      } else {
        // Keep the one with higher priority status
        const existingPriority = existing.status === 'approved' || existing.status === 'auto-approved' ? 2 : 1;
        const currentPriority = approval.status === 'approved' || approval.status === 'auto-approved' ? 2 : 1;
        
        if (currentPriority > existingPriority) {
          // Current has higher priority - replace
          deduplicatedMap.set(key, approval);
        } else if (currentPriority === existingPriority) {
          // Same priority - keep the one with more recent timestamp
          const existingTime = existing.approvedAt?.toMillis() || existing.uploadedAt?.toMillis() || 0;
          const currentTime = approval.approvedAt?.toMillis() || approval.uploadedAt?.toMillis() || 0;
          if (currentTime > existingTime) {
            deduplicatedMap.set(key, approval);
          }
        }
        // If existing has higher priority, keep it (don't replace)
      }
    });

    const finalApprovals = Array.from(deduplicatedMap.values());
    console.log('Final deduplicated approvals:', finalApprovals.map(a => ({ 
      filePath: a.filePath, 
      status: a.status, 
      id: a.id,
      projectName: a.projectName,
      customerNumber: a.customerNumber
    })));
    setAllApprovals(finalApprovals);
  }, [rawApprovals, projectsMap, customersMap]);

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

  // Fast in-memory filtering for instant UI response
  useEffect(() => {
    let filtered = [...allApprovals];

    if (filterProject !== 'all') {
      filtered = filtered.filter((a) => a.projectId === filterProject);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter((a) => a.status === filterStatus);
    }

    const term = filterCustomer.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((a) => {
        const num = a.customerNumber?.toLowerCase() || '';
        const email = a.customerEmail?.toLowerCase() || '';
        const projectName = a.projectName.toLowerCase();
        const fileName = a.fileName.toLowerCase();
        return (
          num.includes(term) ||
          email.includes(term) ||
          projectName.includes(term) ||
          fileName.includes(term)
        );
      });
    }

    setApprovals(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [allApprovals, filterProject, filterStatus, filterCustomer]);

  const totalApprovals = approvals.length;
  const pendingCount = approvals.filter((a) => a.status === 'pending').length;
  const approvedCount = approvals.filter((a) => a.status === 'approved' || a.status === 'auto-approved').length;

  return (
    <div className="px-8 py-8 space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">Work Report Approvals</h2>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Monitor report approval status and dates.
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                ⚠️ Approval status is updated automatically. Admin can view but cannot manually change status.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-gray-200">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total</p>
                <p className="text-sm font-semibold text-gray-900">{totalApprovals}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-yellow-200">
                <p className="text-[11px] text-yellow-700 uppercase tracking-wide">Pending</p>
                <p className="text-sm font-semibold text-yellow-800">{pendingCount}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-white/90 border border-green-200">
                <p className="text-[11px] text-green-700 uppercase tracking-wide">Approved</p>
                <p className="text-sm font-semibold text-green-800">{approvedCount}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Filter by Project
              </label>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
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
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Filter by Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="auto-approved">Auto-Approved</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Filter by Customer / Email / Project / File
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
                    />
                  </svg>
                </span>
                <input
                  type="text"
                  value={filterCustomer}
                  onChange={(e) => setFilterCustomer(e.target.value)}
                  placeholder="Search by customer number, email, project, or file name"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 focus:border-green-power-500 placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 animate-pulse"
                >
                  <div className="h-5 w-32 rounded-full bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-200" />
                  <div className="h-6 w-24 rounded-full bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                </div>
              ))}
            </div>
          ) : approvals.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
              <p className="text-sm font-medium text-gray-700">
                No report approvals found for the selected filters.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Try adjusting the project, status, or customer filters to widen your search.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[25%]">
                      Report File
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[20%]">
                      Project
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[20%]">
                      Customer
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[15%]">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[20%]">
                      Approval Date & Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {approvals
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((approval) => (
                    <tr key={approval.id} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2.5">
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {approval.fileName || 'Untitled file'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">{approval.projectName}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-xs text-gray-900 truncate">
                          {approval.customerNumber 
                            ? approval.customerNumber.charAt(0).toUpperCase() + approval.customerNumber.slice(1)
                            : 'N/A'}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">{approval.customerEmail || 'N/A'}</div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={getStatusBadge(approval.status)}>
                          {getStatusLabel(approval.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {approval.approvedAt ? (
                          <div className="text-xs text-gray-900">
                            {formatDate(approval.approvedAt)}
                          </div>
                        ) : approval.status === 'pending' && approval.autoApproveDate ? (
                          <div>
                            <div className="text-xs text-gray-500">Auto-approve:</div>
                            <div className="text-[10px] text-gray-400">{formatDate(approval.autoApproveDate)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Not approved yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(approvals.length / itemsPerPage)}
                totalItems={approvals.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(newItemsPerPage) => {
                  setItemsPerPage(newItemsPerPage);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-blue-800 font-semibold mb-1">📋 Approval Rules</p>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>Customer can approve/acknowledge reports manually</li>
          <li>If no objection within 5 working days, reports are auto-approved</li>
          <li>Email notifications are sent on upload and auto-approval</li>
          <li>Admin can view report status and approval date & time</li>
        </ul>
      </div>
    </div>
  );
}
