/**
 * Cây danh mục khớp master Tóm tắt_v2 (cột A–B).
 * Danh mục con không gắn thu/chi — Thu/Chi chỉ nằm trên giao dịch.
 */
export const CATEGORY_TREE: Array<{
  group: string;
  children: string[];
}> = [
  { group: "Ăn uống", children: ["Ăn sáng", "Ăn trưa", "Ăn tối", "Cafe"] },
  { group: "Quà tặng", children: ["Quà tặng"] },
  { group: "Nhà", children: ["Phí quản lý", "Điện nước", "Vé xe", "Mua sắm"] },
  {
    group: "Công việc",
    children: ["ADS", "Tài khoản", "Lái xe", "Khác"],
  },
  { group: "Giải trí", children: ["Giải trí"] },
  { group: "Đi lại", children: ["Xăng xe", "Grab", "Taxi"] },
  { group: "Shoping", children: ["Làm đẹp", "Shopee", "Lazada"] },
  { group: "Chưa phân loại", children: ["Chưa phân loại"] },
];

/** Map tên danh mục con → tên nhóm cha */
export function buildChildToGroupMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of CATEGORY_TREE) {
    for (const child of g.children) {
      map.set(child.toLowerCase(), g.group);
    }
  }
  return map;
}
