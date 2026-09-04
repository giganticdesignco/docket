<script setup lang="ts">
// The settings sidebar: every settings page, grouped, so the gear in
// the rail is one entry and the pages find each other here.
const { isAdmin, can } = useCurrentUser()

const sections = computed(() => [
  { label: 'Team', links: [
    ...(can('manage_people') ? [{ label: 'People', to: '/admin/users' }] : []),
    ...(isAdmin.value ? [{ label: 'Permissions', to: '/admin/permissions' }] : []),
  ] },
  { label: 'Work', links: [
    ...(can('manage_settings') ? [{ label: 'Projects', to: '/admin/project-settings' }, { label: 'Departments', to: '/admin/departments' }, { label: 'Project templates', to: '/admin/project-templates' }, { label: 'Task statuses', to: '/admin/task-statuses' }] : []),
    ...(can('manage_reference') ? [{ label: 'Task types', to: '/admin/tasks' }] : []),
  ] },
  { label: 'Money', links: can('manage_settings')
    ? [
        { label: 'Invoices and quotes', to: '/admin/invoice-settings' },
        { label: 'Page templates', to: '/admin/page-templates' },
        { label: 'Estimator', to: '/admin/estimator' },
        { label: 'Expense categories', to: '/admin/expense-categories' },
      ]
    : [] },
  { label: 'Data', links: can('manage_settings') ? [{ label: 'Imports', to: '/admin/imports', also: ['/admin/harvest', '/admin/clickup'] }] : [] },
  { label: 'Docket', links: can('manage_settings') ? [{ label: 'Feedback', to: '/admin/feedback' }] : [] },
])
</script>

<template>
  <SubNav v-if="isAdmin || can('manage_settings') || can('manage_people')" title="Settings" home="/admin" :sections="sections" />
</template>
