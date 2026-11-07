import React from 'react';
import { SystemControls, type SystemControlsTab } from './SystemControls';

export { SystemControls, type SystemControlsTab };

export interface FeatureManagementProps {
  initialTab?: SystemControlsTab;
  onTabChange?: (tab: SystemControlsTab) => void;
}

export const FeatureManagement: React.FC<FeatureManagementProps> = (props) => {
  return <SystemControls {...props} />;
};

export default FeatureManagement;
