import React from 'react';
import {
  MaterialDesignIcons,
  MaterialDesignIconsIconName,
} from '@react-native-vector-icons/material-design-icons/static';

type Props = {
  name: MaterialDesignIconsIconName;
  color: string;
  size?: number;
  accessibilityLabel?: string;
};

export function AppIcon({ name, color, size = 22, accessibilityLabel }: Props) {
  return (
    <MaterialDesignIcons
      accessibilityElementsHidden={!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      name={name}
      color={color}
      size={size}
    />
  );
}
