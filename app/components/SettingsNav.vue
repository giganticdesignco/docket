<script setup lang="ts">
// The settings sidebar: every settings page, grouped, so the gear in
// the rail is one entry and the pages find each other here.
const { isAdmin, can } = useCurrentUser()

const sections = computed(() => [
  { label: 'Team', links: [
    ...(can('manage_people') ? [{ label: 'People', to: '/admin/users', icon: 'i-lucide-users' }] : []),
    ...(isAdmin.value ? [{ label: 'Permissions', to: '/admin/permissions', icon: 'i-lucide-shield-check' }] : []),
  ] },
  { label: 'Work', links: [
    ...(can('manage_settings') ? [{ label: 'Projects', to: '/admin/project-settings', icon: 'i-lucide-folder-kanban' }, { label: 'Departments', to: '/admin/departments', icon: 'i-lucide-network' }, { label: 'Project templates', to: '/admin/project-templates', icon: 'i-lucide-layout-template' }, { label: 'Task statuses', to: '/admin/task-statuses', icon: 'i-lucide-circle-dot' }] : []),
    ...(can('manage_reference') ? [{ label: 'Task types', to: '/admin/tasks', icon: 'i-lucide-tags' }] : []),
  ] },
  { label: 'Money', links: can('manage_settings')
    ? [
        { label: 'Invoices and quotes', to: '/admin/invoice-settings', icon: 'i-lucide-file-text' },
        { label: 'Page templates', to: '/admin/page-templates', icon: 'i-lucide-panels-top-left' },
        { label: 'Estimator', to: '/admin/estimator', icon: 'i-lucide-calculator' },
        { label: 'Expense categories', to: '/admin/expense-categories', icon: 'i-lucide-receipt' },
      ]
    : [] },
  { label: 'Data', links: can('manage_settings') ? [{ label: 'Imports', to: '/admin/imports', icon: 'i-lucide-download', also: ['/admin/harvest', '/admin/clickup'] }] : [] },
  { label: 'Docket', links: can('manage_settings') ? [{ label: 'Feedback', to: '/admin/feedback', icon: 'i-lucide-message-square-warning' }] : [] },
])
</script>

<template>
  <SubNav v-if="isAdmin || can('manage_settings') || can('manage_people')" title="Settings" home="/admin" :sections="sections" />
</template>
