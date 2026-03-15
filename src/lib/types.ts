export type UserOut = {
  id: string;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  created_at: string;
  last_login_at?: string | null;
};

export type ListOut = {
  id: string;
  user_id: string;
  name: string;
  template_id?: string | null;
  items_count: number;
  created_at: string;
  updated_at: string;
};

export type ListCreate = {
  name: string;
  template_id?: string | null;
};

export type ListUpdate = {
  name?: string | null;
};

export type ItemOut = {
  id: string;
  user_id: string;
  list_id: string;
  name: string;
  qty?: number | null;
  purchased: boolean;
  purchased_at?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ItemCreate = {
  name: string;
  qty?: number | null;
  sort_order?: number;
};

export type ItemUpdate = {
  name?: string | null;
  qty?: number | null;
  sort_order?: number | null;
  purchased?: boolean | null;
};

export type TemplateOut = {
  id: string;
  user_id: string;
  name: string;
  items_count: number;
  created_at: string;
  updated_at: string;
};

export type TemplateItemOut = {
  id: string;
  user_id: string;
  template_id: string;
  name: string;
  qty?: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TemplateDetailOut = TemplateOut & {
  items: TemplateItemOut[];
};

export type TemplateItemCreate = {
  name: string;
  qty?: number | null;
  sort_order?: number;
};

export type TemplateItemUpdate = {
  name?: string | null;
  qty?: number | null;
  sort_order?: number | null;
};

export type TemplateCreate = {
  name: string;
  items?: TemplateItemCreate[];
};

export type TemplateUpdate = {
  name?: string | null;
};

export type CreateListFromTemplate = {
  name?: string | null;
};

export type DashboardTemplateOut = {
  id: string;
  name: string;
  items_count: number;
  created_at: string;
  updated_at: string;
};

export type DashboardListOut = {
  id: string;
  name: string;
  items_count: number;
  created_at: string;
  updated_at: string;
};

export type DashboardOut = {
  list_count: number;
  templates_count: number;
  last_created_lists: DashboardListOut[];
  last_created_templates: DashboardTemplateOut[];
};
