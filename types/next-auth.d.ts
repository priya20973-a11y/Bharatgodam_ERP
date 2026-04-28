import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    role: string;
    fullName?: string;
    email: string;
    companyName?: string;
    phoneNumber?: string;
    warehouseLocation?: string;
    gstNumber?: string;
  }

  interface Session {
    user: User;
  }
}