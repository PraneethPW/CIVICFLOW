export type Application = {
  id: string;
  serviceTitle: string;
  department: string;
  status: string;
  progress: number;
  eta: string;
  risk: number;
  createdAt: string;
  version?: number;
  draft: string;
  documents: {
    id: string;
    name: string;
    status: string;
    fileId?: string;
    fileName?: string;
    ocrConfidence?: number;
  }[];
  timeline: { label: string; done: boolean; at: string }[];
};
export type Complaint = {
  id: string;
  subject: string;
  department: string;
  draft: string;
  priority: string;
  status: string;
  response?: string;
  createdAt: string;
  applicationId?: string;
  version: number;
};
