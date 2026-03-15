import type {
  ItemOut,
  ListOut,
  TemplateDetailOut,
  TemplateItemOut,
  TemplateOut,
} from "../../lib/types";

type ListOverrides = Partial<ListOut>;
type ItemOverrides = Partial<ItemOut>;
type TemplateOverrides = Partial<TemplateOut>;
type TemplateItemOverrides = Partial<TemplateItemOut>;
type TemplateDetailOverrides = Partial<TemplateDetailOut>;

export const makeList = (overrides: ListOverrides = {}): ListOut => ({
  id: "list-1",
  user_id: "user-1",
  name: "Weekly groceries",
  template_id: null,
  items_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

export const makeItem = (overrides: ItemOverrides = {}): ItemOut => ({
  id: "item-1",
  user_id: "user-1",
  list_id: "list-1",
  name: "Milk",
  qty: null,
  purchased: false,
  purchased_at: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

export const makeTemplate = (
  overrides: TemplateOverrides = {}
): TemplateOut => ({
  id: "template-1",
  user_id: "user-1",
  name: "Staples",
  items_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

export const makeTemplateItem = (
  overrides: TemplateItemOverrides = {}
): TemplateItemOut => ({
  id: "template-item-1",
  user_id: "user-1",
  template_id: "template-1",
  name: "Pasta",
  qty: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

export const makeTemplateDetail = (
  overrides: TemplateDetailOverrides = {}
): TemplateDetailOut => ({
  ...makeTemplate(overrides),
  items: [],
  ...overrides,
});
