import { NextResponse } from 'next/server';

export async function GET() {
  const headers = [
    'Name',
    'Address',
    'State',
    'ClientType',
    'Mobile',
    'PANNumber',
    'AadharNumber',
    'GSTNumber',
    'Email'
  ];

  const sampleData = [
    'John Doe',
    '123 Farm Road',
    'Maharashtra',
    'FARMER',
    '9876543210',
    'ABCDE1234F',
    '123456789012',
    '27ABCDE1234F1Z5',
    'john.doe@example.com'
  ];

  const csvContent = [
    headers.join(','),
    sampleData.join(',')
  ].join('\n');

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="client-master-template.csv"',
    },
  });
}
