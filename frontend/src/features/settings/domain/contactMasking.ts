export function maskEmail(email: string) {
  if (!email || !email.includes('@')) return '••••@••••.•••';
  const [user, domain] = email.split('@');
  if (!user || !domain) return '••••@••••.•••';
  if (user.length <= 2) return `••@${domain}`;
  return `${user.slice(0, 2)}••••@${domain}`;
}

export function maskPhone(phone: string) {
  if (!phone?.trim()) return 'Not set';
  return `•••• •••• ${phone.trim().slice(-4)}`;
}
