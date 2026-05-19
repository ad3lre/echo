export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  status: 'online' | 'offline' | 'idle' | 'do_not_disturb';
  /** Optional custom status message (e.g. "Heads down in Echo") */
  customStatus?: string;
  createdAt: string;
  updatedAt: string;
  /** Echo: True if this is a shadow placeholder user for an imported Discord account. */
  isDiscordShadow?: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  avatar?: string;
  status: 'online' | 'offline' | 'idle' | 'do_not_disturb';
  bio?: string;
  // Add other profile-specific fields
}
