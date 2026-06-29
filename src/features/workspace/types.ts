export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'tags';

export interface MetadataField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  options?: string[];
}

export interface Workspace {
  id: string;
  name: string;
  mdxPath: string;
  colorIdx: number;
  metadataFields: MetadataField[];
  createdAt: string;
}
