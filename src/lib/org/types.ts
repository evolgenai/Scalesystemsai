export type OrgRoleName = "OWNER" | "ADMIN" | "MEMBER";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  role: OrgRoleName;
};
