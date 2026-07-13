import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    role: string;
    fullName?: string;
    email: string;
    companyName?: string;
    phoneNumber?: string;
    address?: string | null;
    warehouseLocation?: string;
    gstNumber?: string;
    bankName?: string;
    accountName?: string;
    bankAccountNumber?: string;
    ifscCode?: string;
    bankBranch?: string;
    companyLogo?: string | null;
    state?: string;
    isNewRegistration?: boolean;
    storagePlan?: string;
    coldLanguage?: string;
    staffId?: string;
    isStaff?: boolean;
    permissions?: any;
  }

  interface Session {
    user: User;
  }
}