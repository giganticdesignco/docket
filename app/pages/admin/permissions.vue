<script setup lang="ts">
import { PERMISSIONS, type PermissionKey } from '~~/shared/types/app'

// Roles and the matrix: what each role may do. Admin has everything and
// cannot be changed. Built-in roles keep their key; Gigantic can add
// its own roles, rename them, and delete them once nobody has them. A
// tick writes a row to permissions; RLS reads it live, so a change
// applies on the next request for everyone with that role.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Permissions' })

const supabase = useSupabaseClient()
const toast = useToast()

const { data: roles, refresh: refreshRoles } = await useRoles()
const { data: rows, refresh } = await useAsyncData('permissions', async () => {
  const { data, error } = await supabase.from('permissions').select('role, key')
  if (error) throw error
  return data
}, fresh)
const { data: counts } = await useAsyncData('role-counts', async () => {
  const { data, error } = await supabase.from('profiles').select('role')
  if (error) throw error
  const c: Record<string, number> = {}
  for (const p of data) c[p.role] = (c[p.role] ?? 0) + 1
  return c
}, fresh)

const has = (role: string, key: string) => role === 'admin' || !!rows.value?.some(r => r.role === role && r.key === key)
const busy = ref<string | null>(null)
async function toggle(role: string, key: PermissionKey) {
  busy.value = `${role}:${key}`
  try {
    const q = has(role, key)
      ? supabase.from('permissions').delete().eq('role', role).eq('key', key)
      : supabase.from('permissions').insert({ role, key })
    const { error } = await q
    if (error) throw error
    await refresh()
  } catch (e) {
    toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}

// ---------- roles ----------

type Role = NonNullable<typeof roles.value>[number]
const editing = ref<Role | null>(null)
const adding = ref(false)
const form = reactive({ label: '', description: '' })
const slug = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)
function openAdd() {
  form.label = ''
  form.description = ''
  adding.value = true
}
function openEdit(r: Role) {
  form.label = r.label
  form.description = r.description ?? ''
  editing.value = r
}
const saving = ref(false)
async function saveRole() {
  saving.value = true
  try {
    if (editing.value) {
      const { error } = await supabase.from('roles').update({ label: form.label.trim(), description: form.description.trim() || null }).eq('key', editing.value.key)
      if (error) throw error
    } else {
      const key = slug(form.label)
      if (!key || key.length < 2) throw new Error('Give the role a name with at least two letters.')
      const { error } = await supabase.from('roles').insert({ key, label: form.label.trim(), description: form.description.trim() || null, position: (roles.value?.length ?? 0) + 1 })
      if (error) throw error.code === '23505' ? new Error('A role with that name already exists.') : error
    }
    adding.value = false
    editing.value = null
    await refreshRoles()
  } catch (e) {
    toast.add({ title: 'Could not save the role', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}
const deleting = ref<Role | null>(null)
async function deleteRole() {
  const r = deleting.value
  if (!r) return
  const { error } = await supabase.from('roles').delete().eq('key', r.key)
  deleting.value = null
  if (error) toast.add({ title: 'Could not delete the role', description: error.message, color: 'error' })
  else await Promise.all([refreshRoles(), refresh()])
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Roles and permissions</h1>
        <p class="text-sm text-muted">What each role can see and do. Changes apply the next time that person loads a page. Admins can do everything.</p>
      </div>
      <UButton icon="i-lucide-plus" class="ml-auto" @click="openAdd">New role</UButton>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="px-4 py-2 font-medium">Permission</th>
              <th v-for="r in roles" :key="r.key" class="px-4 py-2 text-center font-medium" :title="r.description ?? ''">
                <button type="button" class="hover:underline" :title="r.is_builtin ? 'Rename' : 'Rename or delete'" @click="openEdit(r)">{{ r.label }}</button>
                <div class="text-[10px] font-normal text-dimmed">{{ counts?.[r.key] ?? 0 }} {{ (counts?.[r.key] ?? 0) === 1 ? 'person' : 'people' }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in PERMISSIONS" :key="p.key" class="border-b border-default last:border-0">
              <td class="px-4 py-2">
                <div class="font-medium">{{ p.label }}</div>
                <div class="text-xs text-muted">{{ p.hint }}</div>
              </td>
              <td v-for="r in roles" :key="r.key" class="px-4 py-2 text-center">
                <UIcon v-if="r.key === 'admin'" name="i-lucide-check" class="size-4 text-muted" />
                <UCheckbox v-else :model-value="has(r.key, p.key)" :disabled="busy === `${r.key}:${p.key}`" class="inline-flex" :aria-label="`${r.label}: ${p.label}`" @update:model-value="toggle(r.key, p.key)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard>
      <template #header><h2 class="font-semibold">The roles</h2></template>
      <dl class="grid gap-3 text-sm sm:grid-cols-2">
        <div v-for="r in roles" :key="r.key">
          <dt class="font-medium">{{ r.label }} <span v-if="r.is_builtin" class="text-xs font-normal text-dimmed">built in</span></dt>
          <dd class="text-muted">{{ r.description || 'No description yet.' }}</dd>
        </div>
      </dl>
      <p class="mt-4 text-xs text-muted">A new role starts with nothing ticked: own time and expenses, and the tasks the person made or is on. Turning off "See rates and amounts" hides money everywhere in Docket for that role, though a person's own entries still carry their rate in the database. A client role will live here too once clients can sign in.</p>
    </UCard>

    <UModal :open="adding || !!editing" :title="editing ? `Edit ${editing.label}` : 'New role'" @update:open="(v) => { if (!v) { adding = false; editing = null } }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required :help="editing ? undefined : `Key: ${slug(form.label) || '...'}`">
            <UInput v-model="form.label" class="w-full" placeholder="Producer" autofocus />
          </UFormField>
          <UFormField label="Description" help="Shown on this page and in the People form.">
            <UInput v-model="form.description" class="w-full" placeholder="Runs projects, sees budgets, no billing" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center gap-2">
          <UButton v-if="editing && !editing.is_builtin" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleting = editing; editing = null;">Delete</UButton>
          <UButton variant="ghost" color="neutral" class="ml-auto" @click="adding = false; editing = null;">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.label.trim()" @click="saveRole">{{ editing ? 'Save' : 'Create role' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleting" :title="`Delete ${deleting?.label}?`" @update:open="(v) => { if (!v) deleting = null }">
      <template #body>
        <p class="text-sm">Its permissions go with it. Nobody can have this role at the time, so move people to another role first.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleting = null;">Cancel</UButton>
          <UButton color="error" @click="deleteRole">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
