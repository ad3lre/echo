export type EchoTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type EchoTicketFormField = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  placeholder?: string;
  required?: boolean;
  options?: string[];
};

export type EchoTicketCategory = {
  id: string;
  name: string;
  emoji?: string;
};

export interface EchoTicketConfig {
  enabled: boolean;
  panelChannelId: string | null;
  ticketCategoryId: string | null;
  handlerRoleIds: string[];
  logChannelId: string | null;
  formFields: EchoTicketFormField[];
  maxOpenPerUser: number;
  greetingMessage: string;
  requireCategory: boolean;
  ticketCategories: EchoTicketCategory[];
}

export interface EchoTicket {
  id: string;
  serverId: string;
  channelId: string;
  authorId: string;
  subject: string;
  category: string | null;
  status: EchoTicketStatus;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedBy: string | null;
}
