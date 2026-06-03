export interface CustomCategory {
  id:         string;
  owner_id:   string;
  name:       string;
  icon:       string;       // Ionicons-Name
  color:      string;       // Hex
  exercises:  string[];
  created_at: string;
}

export type NewCustomCategory = Pick<CustomCategory, 'name' | 'icon' | 'color' | 'exercises'>;
