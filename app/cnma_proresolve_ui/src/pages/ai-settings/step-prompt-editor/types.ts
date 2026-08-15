export type DataType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'object' | 'array';
export type DataSource = 'sap_qm' | 'pdf_ocr' | 'image_extract' | 'vector_search' | 'manual_input' | 'ai_enrichment';

export interface DataSchemaField {
    type: DataType;
    title?: string;
    label?: string;
    description?: string;
    format?: string;
    source?: DataSource;
    'x-source'?: DataSource;
    properties?: Record<string, DataSchemaField>;
    items?: DataSchemaField;
}

export interface DataSchemaConfig {
    type: 'object';
    properties: Record<string, DataSchemaField>;
    required?: string[];
    additionalProperties?: boolean;
}

export interface FlatDataSchemaField {
    key: string;
    label: string;
    type: DataType;
    source: DataSource;
    description?: string;
    required?: boolean;
}

export interface FieldConstraints {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    minItems?: number;
    pattern?: string;
}

export interface FormFieldConfig {
    key: string;
    label?: string;
    widget: string;
    /** Legacy field. New configurations use key as the implicit AI output path. */
    binding?: string;
    width?: '100%' | '50%' | '33%';
    visible?: boolean;
    colSpan?: number;
    rowSpan?: number;
    constraints?: FieldConstraints;
}

export interface FormGroupConfig { id: string; label: string; fieldKeys: string[]; width?: string; columns?: number; order?: number }
export interface FormSpacerConfig { id: string; groupId: string; order: number; colSpan: number; height: 'small' | 'medium' | 'large' }
export interface FormSchemaConfig { fields: FormFieldConfig[]; groups?: FormGroupConfig[]; spacers?: FormSpacerConfig[] }

export interface StepRule {
    id: string;
    name?: string;
    type: string;
    severity: 'error' | 'warning' | 'info';
    enabled?: boolean;
    message: string;
    pattern?: string;
    inputFields?: string[];
}

export interface ConstraintsConfig { enabled?: boolean; rules: StepRule[] }
