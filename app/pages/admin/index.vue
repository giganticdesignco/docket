<script setup lang="ts">
// Where the gear lands. One card per settings page.
definePageMeta({ middleware: 'can', permission: 'manage_settings' })
const { isAdmin } = useCurrentUser()
useHead({ title: 'Settings' })

const cards = [
  { label: 'People', to: '/admin/users', icon: 'i-lucide-users', text: 'Who can sign in, their role, default rate, and hours per week.' },
  { label: 'Projects', to: '/admin/project-settings', icon: 'i-lucide-folder-cog', text: 'Where project folders live on the office server.' },
  { label: 'Task statuses', to: '/admin/task-statuses', icon: 'i-lucide-circle-dot', text: 'The status list tasks move through, and which ones mean done, paused, or with the client.' },
  { label: 'Task types', to: '/admin/tasks', icon: 'i-lucide-list-checks', text: 'The billing task types (Design, Development, and so on) and whether they bill by default.' },
  { label: 'Expense categories', to: '/admin/expense-categories', icon: 'i-lucide-tags', text: 'Categories for expenses and receipts.' },
  { label: 'Invoices and quotes', to: '/admin/invoice-settings', icon: 'i-lucide-file-text', text: 'Company block, payment instructions, numbering, terms, and overdue reminders.' },
  { label: 'Imports', to: '/admin/imports', icon: 'i-lucide-download', text: 'Bring history in from Harvest and ClickUp.' },
  { label: 'Permissions', to: '/admin/permissions', icon: 'i-lucide-shield-check', text: 'What each role can see and do. Admins only.', admin: true },
]
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Settings</h1>
      <p class="text-sm text-muted">Reference data and how Docket behaves. Admins only.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="c in cards.filter(c => !c.admin || isAdmin)" :key="c.to" :to="c.to" class="block">
        <UCard class="h-full transition-colors hover:bg-elevated/50">
          <div class="flex items-start gap-3">
            <UIcon :name="c.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <div class="font-medium">{{ c.label }}</div>
              <p class="mt-1 text-sm text-muted">{{ c.text }}</p>
            </div>
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
