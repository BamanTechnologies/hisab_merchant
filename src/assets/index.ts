/**
 * Icon Asset Registry
 * 
 * This file is the single source of truth for all icon imports.
 * Icons are organized by category and use lazy loading for better performance.
 * 
 * To add a new icon:
 * 1. For Lucide icons: Add an entry to the icon category below
 * 2. For custom SVG icons: Place the icon file in the appropriate category directory and add an entry
 * 3. For flag images: Place PNG in flags/ directory and add an entry
 * 4. The icon will automatically be available via the Icon component
 */

// ============================================================================
// FLAGS
// PNG flag images for country flags
// ============================================================================
const flags = {
	// Add flag icons here as needed
	// Example: 'flags/USA': () => import('./flags/USA.png'),
} as const;

// ============================================================================
// ICONS
// General SVG icons for UI elements (using Lucide Svelte icons)
// ============================================================================
const icon = {
	// Navigation & UI
	'icon/menu': () => import('@lucide/svelte/icons/menu'),
	'icon/search': () => import('@lucide/svelte/icons/search'),
	'icon/home': () => import('@lucide/svelte/icons/home'),
	'icon/settings': () => import('@lucide/svelte/icons/settings'),
	'icon/user': () => import('@lucide/svelte/icons/user'),
	'icon/users': () => import('@lucide/svelte/icons/users'),
	'icon/bell': () => import('@lucide/svelte/icons/bell'),
	'icon/mail': () => import('@lucide/svelte/icons/mail'),
	'icon/phone': () => import('@lucide/svelte/icons/phone'),
	'icon/message-circle': () => import('@lucide/svelte/icons/message-circle'),
	'icon/smile': () => import('@lucide/svelte/icons/smile'),
	'icon/file-text': () => import('@lucide/svelte/icons/file-text'),
	
	// Actions
	'icon/plus': () => import('@lucide/svelte/icons/plus'),
	'icon/minus': () => import('@lucide/svelte/icons/minus'),
	// 'icon/minus': () => import('@lucide/svelte/icons/minus'),
	'icon/x': () => import('@lucide/svelte/icons/x'),
	'icon/check': () => import('@lucide/svelte/icons/check'),
	'icon/edit': () => import('@lucide/svelte/icons/edit'),
	'icon/trash': () => import('@lucide/svelte/icons/trash'),
	'icon/save': () => import('@lucide/svelte/icons/save'),
	'icon/download': () => import('@lucide/svelte/icons/download'),
	'icon/upload': () => import('@lucide/svelte/icons/upload'),
	'icon/upload-cloud': () => import('@lucide/svelte/icons/upload-cloud'),
	
	// Commerce
	'icon/shopping-cart': () => import('@lucide/svelte/icons/shopping-cart'),
	'icon/shopping-bag': () => import('@lucide/svelte/icons/shopping-bag'),
	'icon/package': () => import('@lucide/svelte/icons/package'),
	'icon/credit-card': () => import('@lucide/svelte/icons/credit-card'),
	'icon/store': () => import('@lucide/svelte/icons/store'),
	'icon/trending-up': () => import('@lucide/svelte/icons/trending-up'),
	'icon/building': () => import('@lucide/svelte/icons/building'),
	'icon/bar-chart': () => import('@lucide/svelte/icons/bar-chart'),
	'icon/user-circle': () => import('@lucide/svelte/icons/user-circle'),
	'icon/star': () => import('@lucide/svelte/icons/star'),
	'icon/quote': () => import('@lucide/svelte/icons/quote'),
	
	// Media & Files
	'icon/image': () => import('@lucide/svelte/icons/image'),
	'icon/file': () => import('@lucide/svelte/icons/file'),
	'icon/folder': () => import('@lucide/svelte/icons/folder'),
	
	// Arrows & Navigation
	'icon/arrow-left': () => import('@lucide/svelte/icons/arrow-left'),
	'icon/arrow-right': () => import('@lucide/svelte/icons/arrow-right'),
	'icon/arrow-up': () => import('@lucide/svelte/icons/arrow-up'),
	'icon/arrow-down': () => import('@lucide/svelte/icons/arrow-down'),
	'icon/chevron-left': () => import('@lucide/svelte/icons/chevron-left'),
	'icon/chevron-right': () => import('@lucide/svelte/icons/chevron-right'),
	'icon/chevron-up': () => import('@lucide/svelte/icons/chevron-up'),
	'icon/chevron-down': () => import('@lucide/svelte/icons/chevron-down'),
	'icon/user-plus': () => import('@lucide/svelte/icons/user-plus'),
	'icon/tag': () => import('@lucide/svelte/icons/tag'),
	'icon/layout-grid': () => import('@lucide/svelte/icons/layout-grid'),
	'icon/map-pin': () => import('@lucide/svelte/icons/map-pin'),
	'icon/box': () => import('@lucide/svelte/icons/box'),
	'icon/log-out': () => import('@lucide/svelte/icons/log-out'),
	'icon/user-minus': () => import('@lucide/svelte/icons/user-minus'),
	
	// Status & Feedback
	'icon/info': () => import('@lucide/svelte/icons/info'),
	'icon/alert-circle': () => import('@lucide/svelte/icons/alert-circle'),
	'icon/check-circle': () => import('@lucide/svelte/icons/check-circle'),
	'icon/x-circle': () => import('@lucide/svelte/icons/x-circle'),
	'icon/eye': () => import('@lucide/svelte/icons/eye'),
	'icon/eye-off': () => import('@lucide/svelte/icons/eye-off'),
	'icon/refresh-cw': () => import('@lucide/svelte/icons/refresh-cw'),
	'icon/shield': () => import('@lucide/svelte/icons/shield'),
	'icon/shield-check': () => import('@lucide/svelte/icons/shield-check'),
	'icon/lock': () => import('@lucide/svelte/icons/lock'),
	'icon/help-circle': () => import('@lucide/svelte/icons/help-circle'),
	'icon/send': () => import('@lucide/svelte/icons/send'),
	'icon/sun': () => import('@lucide/svelte/icons/sun'),
	'icon/moon': () => import('@lucide/svelte/icons/moon'),
	'icon/monitor': () => import('@lucide/svelte/icons/monitor'),
	'icon/languages': () => import('@lucide/svelte/icons/languages'),
	'icon/more-vertical': () => import('@lucide/svelte/icons/more-vertical'),
	'icon/printer': () => import('@lucide/svelte/icons/printer'),
	'icon/laptop': () => import('@lucide/svelte/icons/laptop'),
	'icon/headphones': () => import('@lucide/svelte/icons/headphones'),
	'icon/watch': () => import('@lucide/svelte/icons/watch'),
	'icon/shoe': () => import('@lucide/svelte/icons/shopping-bag'),
	'icon/chair': () => import('@lucide/svelte/icons/box'),
	'icon/briefcase': () => import('@lucide/svelte/icons/shopping-bag'),
	'icon/line-chart': () => import('@lucide/svelte/icons/line-chart'),
	'icon/calendar': () => import('@lucide/svelte/icons/calendar'),
	'icon/dollar-sign': () => import('@lucide/svelte/icons/dollar-sign'),
	'icon/clock': () => import('@lucide/svelte/icons/clock'),

	'icon/activity': () => import('@lucide/svelte/icons/activity'),
	
	// Custom SVG icons can be added here:
	// 'icon/custom-name': () => import('./icon/custom-name.svg?component'),
} as const;

// ============================================================================
// SOCIAL
// Social media platform icons
// ============================================================================
const social = {
	'social/youtube': () => import('@lucide/svelte/icons/youtube'),
	'social/twitter': () => import('@lucide/svelte/icons/twitter'),
	'social/instagram': () => import('@lucide/svelte/icons/instagram'),
	'social/facebook': () => import('@lucide/svelte/icons/facebook'),
} as const;

// ============================================================================
// TECHNOLOGY
// Technology company logos and tech stack icons
// ============================================================================
const technology = {
	// Add technology icons here as needed
	// Example: 'technology/React': () => import('./technology/React.svg?component'),
} as const;

// ============================================================================
// PAYMENT
// Payment method and financial service icons
// ============================================================================
const payment = {
	// Add payment icons here as needed
	// Example: 'payment/Visa': () => import('./payment/Visa.svg?component'),
} as const;

// ============================================================================
// ICON MAP
// Unified map of all icons organized by category
// ============================================================================
export const IconMap = {
	...flags,
	...icon,
	...social,
	...technology,
	...payment,
} as const;

// ============================================================================
// TYPES
// TypeScript types for type-safe icon names
// ============================================================================

/**
 * All available icon names in the format "category/name"
 */
export type IconType = keyof typeof IconMap;

/**
 * Flag icon names (category starts with 'flags/')
 */
export type FlagIconType = Extract<IconType, `flags/${string}`>;

/**
 * General icon names (category starts with 'icon/')
 */
export type GeneralIconType = Extract<IconType, `icon/${string}`>;

/**
 * Social media icon names (category starts with 'social/')
 */
export type SocialIconType = Extract<IconType, `social/${string}`>;

/**
 * Technology icon names (category starts with 'technology/')
 */
export type TechnologyIconType = Extract<IconType, `technology/${string}`>;

/**
 * Payment icon names (category starts with 'payment/')
 */
export type PaymentIconType = Extract<IconType, `payment/${string}`>;

/**
 * Type for the lazy-loaded icon import result
 */
export type IconImport = () => Promise<{ default: any }>;

