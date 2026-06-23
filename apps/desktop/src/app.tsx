import { useEffect, useState } from "react";
import { createEmptySchema, type TitanSchema } from "@titanbase/core";
import { fallbackEditorSettings, SchemaEditor, type EditorAppSettings, type SchemaTemplate, type ThemePreference } from "@titanbase/editor";
import analyticsSchema from "../../../examples/analytics-events/analytics-events.titan.json";
import aiModelRegistrySchema from "../../../examples/ai-model-registry/ai-model-registry.titan.json";
import blogSchema from "../../../examples/blog/blog.titan.json";
import bookingSchema from "../../../examples/booking-system/booking-system.titan.json";
import contentPlatformSchema from "../../../examples/content-platform/content-platform.titan.json";
import crmSchema from "../../../examples/crm/crm.titan.json";
import ecommerceSchema from "../../../examples/ecommerce/ecommerce.titan.json";
import healthcareSchema from "../../../examples/healthcare/healthcare.titan.json";
import hrSchema from "../../../examples/hr-management/hr-management.titan.json";
import inventorySchema from "../../../examples/inventory-management/inventory-management.titan.json";
import learningSchema from "../../../examples/learning-app/learning-app.titan.json";
import marketplaceSchema from "../../../examples/marketplace/marketplace.titan.json";
import messagingSchema from "../../../examples/messaging/messaging.titan.json";
import projectManagementSchema from "../../../examples/project-management/project-management.titan.json";
import saasSchema from "../../../examples/saas/saas.titan.json";
import socialNetworkSchema from "../../../examples/social-network/social-network.titan.json";

const SETTINGS_KEY = "titanbase:desktop-settings";
const themes = new Set<ThemePreference>(["light", "dark", "system"]);

const templates: SchemaTemplate[] = [
  { id: "blog", name: "Blog", description: "Authors, posts, comments, and publishing basics.", schema: blogSchema as TitanSchema },
  { id: "saas", name: "SaaS", description: "Accounts, members, plans, and subscriptions.", schema: saasSchema as TitanSchema },
  { id: "ecommerce", name: "Ecommerce", description: "Customers, products, orders, and line items.", schema: ecommerceSchema as TitanSchema },
  { id: "marketplace", name: "Marketplace", description: "Sellers, listings, buyers, and transactions.", schema: marketplaceSchema as TitanSchema },
  { id: "crm", name: "CRM", description: "Contacts, companies, deals, and activities.", schema: crmSchema as TitanSchema },
  { id: "analytics", name: "Analytics", description: "Events, sessions, identities, and properties.", schema: analyticsSchema as TitanSchema },
  { id: "ai-model-registry", name: "AI Model Registry", description: "Models, providers, versions, evaluations, and deployments.", schema: aiModelRegistrySchema as TitanSchema },
  { id: "booking-system", name: "Booking System", description: "Venues, availability, bookings, guests, and payments.", schema: bookingSchema as TitanSchema },
  { id: "content-platform", name: "Content Platform", description: "Content, authors, revisions, media, and publishing workflows.", schema: contentPlatformSchema as TitanSchema },
  { id: "healthcare", name: "Healthcare", description: "Patients, clinicians, appointments, records, and prescriptions.", schema: healthcareSchema as TitanSchema },
  { id: "hr-management", name: "HR Management", description: "Employees, teams, roles, leave, and performance reviews.", schema: hrSchema as TitanSchema },
  { id: "inventory", name: "Inventory", description: "Products, warehouses, stock movements, suppliers, and orders.", schema: inventorySchema as TitanSchema },
  { id: "learning-app", name: "Learning App", description: "Courses, lessons, learners, enrollments, and progress.", schema: learningSchema as TitanSchema },
  { id: "messaging", name: "Messaging", description: "Users, conversations, messages, reactions, and attachments.", schema: messagingSchema as TitanSchema },
  { id: "project-management", name: "Project Management", description: "Projects, tasks, teams, comments, and activity.", schema: projectManagementSchema as TitanSchema },
  { id: "social-network", name: "Social Network", description: "Profiles, follows, posts, comments, and reactions.", schema: socialNetworkSchema as TitanSchema },
];

function loadSettings(): EditorAppSettings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<EditorAppSettings> | null;
    if (!value) return { ...fallbackEditorSettings };
    return {
      ...fallbackEditorSettings,
      ...value,
      theme: value.theme && themes.has(value.theme) ? value.theme : "light",
      showMinimap: value.showMinimap === true,
    };
  } catch { return { ...fallbackEditorSettings }; }
}

export function App() {
  const [settings, setSettings] = useState<EditorAppSettings>(loadSettings);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)), [settings]);

  const resolvedTheme = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;
  return <SchemaEditor
    initialSchema={createEmptySchema()}
    initialFilename="untitled.titan.json"
    templates={templates}
    settings={settings}
    resolvedTheme={resolvedTheme}
    onSettingsChange={setSettings}
    onResetSettings={() => setSettings({ ...fallbackEditorSettings })}
    fileAdapter={window.titanbaseDesktop}
  />;
}
