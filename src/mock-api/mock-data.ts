export interface MockCustomerB {
  uuid: string;
  email: string;
  name: string;
  phone: string;
  address: string;
  last_updated: string;
}

export const SYSTEM_B_MOCK_DATA: MockCustomerB[] = [
  {
    uuid: 'modern_101',
    email: 'max.mustermann@example.de',
    name: 'Max Mustermann',
    phone: '+49 170 123 4567',
    address: 'Sonnenallee 1a, 12345 Berlin',
    last_updated: '2025-01-10T08:00:00Z',
  },
  {
    uuid: 'modern_102',
    email: 'erika.muster@example.de',
    name: 'Erika Musterfrau',
    phone: '+49 171 987 6543',
    address: 'Hauptstr. 42, 10115 Berlin',
    last_updated: '2024-09-01T11:00:00Z',
  },
  {
    uuid: 'modern_103',
    email: 'lisa.neu@example.de',
    name: 'Lisa Neumann',
    phone: '+49 172 555 0000',
    address: 'Friedrichstr. 99, 10117 Berlin',
    last_updated: '2025-01-15T12:00:00Z',
  },
  {
    uuid: 'modern_104',
    email: 'sophie.mueller@example.de',
    name: 'Sophie Mueller',
    phone: '+49 173 444 8888',
    address: 'Kastanienallee 7a, 10435 Berlin',
    last_updated: '2025-02-01T09:30:00Z',
  },
];
