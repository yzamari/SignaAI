/**
 * Test data fixtures for E2E tests
 */

export const TestUsers = {
  demo: {
    email: 'demo@signaai.com',
    password: 'Demo123!',
    name: 'Demo User',
    phone: '+972501234567',
  },
  sender: {
    email: 'sender@test.com',
    password: 'Test123!',
    name: 'Test Sender',
    phone: '+1234567890',
  },
  signer1: {
    email: 'signer1@test.com',
    password: 'Test123!',
    name: 'Test Signer 1',
    phone: '+1987654321',
  },
  signer2: {
    email: 'signer2@test.com',
    password: 'Test123!',
    name: 'Test Signer 2',
    phone: '+1122334455',
  },
  signer3: {
    email: 'signer3@test.com',
    password: 'Test123!',
    name: 'Test Signer 3',
    phone: '+1555666777',
  },
};

export const TestDocuments = {
  hebrew: {
    filename: 'heskem.pdf',
    title: 'Heskem Document',
    language: 'hebrew',
    expectedFields: 5, // Expected number of signature fields
  },
  english: {
    filename: 'english-contract.pdf',
    title: 'English Contract',
    language: 'english',
    expectedFields: 3,
  },
  arabic: {
    filename: 'arabic-contract.pdf',
    title: 'Arabic Contract',
    language: 'arabic',
    expectedFields: 3,
  },
};

export const TestSigners = {
  single: [
    {
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+1234567890',
    },
  ],
  multiple: [
    {
      name: 'Alice Smith',
      email: 'alice.smith@example.com',
      phone: '+1111111111',
    },
    {
      name: 'Bob Johnson',
      email: 'bob.johnson@example.com',
      phone: '+2222222222',
    },
    {
      name: 'Charlie Brown',
      email: 'charlie.brown@example.com',
      phone: '+3333333333',
    },
  ],
};

export const WorkflowTypes = {
  parallel: 'parallel',
  sequential: 'sequential',
};

export const APIEndpoints = {
  base: 'http://localhost:5112/api/v1',
  ocr: 'http://localhost:5113',
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    me: '/auth/me',
  },
  documents: {
    create: '/documents/create',
    list: '/documents',
    get: '/documents/{id}',
    process: '/documents/process',
    signing: '/signing/documents/{token}',
    submit: '/signing/documents/{document_id}/submit',
  },
  workflows: {
    create: '/workflows/create',
    get: '/workflows/{id}',
  },
};

export const SMSMessages = {
  hebrew: {
    contains: ['שלום', 'חתימה', 'מסמך'],
  },
  english: {
    contains: ['Hello', 'sign', 'document'],
  },
  arabic: {
    contains: ['مرحبا', 'توقيع', 'مستند'],
  },
};

export const ExpectedTimeouts = {
  ocrProcessing: 60000, // 60 seconds
  documentUpload: 30000, // 30 seconds
  apiResponse: 10000, // 10 seconds
  pageLoad: 30000, // 30 seconds
  smsDelivery: 5000, // 5 seconds (mocked)
};

