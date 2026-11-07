export type RoleType = 
  | 'System Admin' 
  | 'Owner' 
  | 'Shop Admin' 
  | 'Cashier' 
  | 'Barber' 
  | 'Customer';

export interface RoleInfo {
  role: RoleType;
  title: string;
  categoryTag: string;
  description: string;
  iconName: string;
}

export interface FeatureDependency {
  moduleId: string;
  moduleName: string;
  reason: string;
}

export interface SubFeature {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isRequired?: boolean;
  dependency?: FeatureDependency;
}

export interface RoleModule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isRequired?: boolean; // Core protected module (e.g. Core security/admin modules)
  isCritical?: boolean; // Critical module requiring confirmation before disabling
  iconName: string;
  subFeatures: SubFeature[];
  savedSubFeatures?: SubFeature[]; // Preserves granular configuration when module is toggled
}

export interface RoleFeatureConfig {
  role: RoleType;
  modules: RoleModule[];
}

export type ModuleStatusType = 'REQUIRED' | 'ENABLED' | 'PARTIAL' | 'DISABLED';
