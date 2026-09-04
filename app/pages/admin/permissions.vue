<script setup lang="ts">
import { PERMISSIONS, SCREENS, FIELDS, type PermissionKey } from '~~/shared/types/app'

// Roles and the matrix: which screens each role opens, what it may do,
// and which money fields it sees. Admin has everything and cannot be
// changed. Built-in roles keep their key; Gigantic can add its own
// roles, rename them, and delete them once nobody has them. A tick
// writes a row to permissions; RLS reads it live, so a change applies
// on the next request for everyone with that role. People adds a grant
// or a revoke for one person on top of their role. View as shows the
// app the way that role or person sees it.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Permissions' })

const supabase = useSupabaseClient()
const toast = useToast()

const __s1 = useRoles()
const __s2 = useAsyncData('permissions', async () => {
  const { data, error } = await supabase.from('permissions').select('role, key')
  if (error) throw error
  return data
}, fresh)
const __s3 = useAsyncData('role-counts', async () => {
  const { data, error } = await supabase.from('profiles').select('role')
  if (error) throw error
  const c: Record<string, number> = {}
  for (const p of data) c[p.role] = (c[p.role] ?? 0) + 1
  return c
}, fresh)

const has = (role: string, key: string) => role === 'admin' || !!rows.value?.some(r => r.role === role && r.key === key)

type Tab = 'screens' | 'actions' | 'fields' | 'people'
const tab = ref<Tab>('screens')
const tabs: { value: Tab, label: string }[] = [{ value: 'screens', label: 'Screens' }, { value: 'actions', label: 'Actions' }, { value: 'fields', label: 'Money fields' }, { value: 'people', label: 'People' }]
const matrix = computed(() => (tab.value === 'screens' ? SCREENS : tab.value === 'fields' ? FIELDS : PERMISSIONS) as readonly { key: PermissionKey, label: string, hint: string }[])

// ---------- view as ----------
const { startViewAs } = useCurrentUser()
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
async function viewAsRole(r: { key: string, label: string }) {
  await startViewAs({ role: r.key, name: `${article(r.label)} ${r.label.toLowerCase()}` })
  navigateTo('/')
}
async function viewAsPerson(p: { id: string, full_name: string, role: string }) {
  await startViewAs({ role: p.role, userId: p.id, name: p.full_name })
  navigateTo('/')
}

// ---------- people: overrides on top of the role ----------
const __s4 = useAsyncData('permission-people', async () => {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role').eq('is_active', true).neq('role', 'client').order('full_name')
  if (error) throw error
  return data
}, fresh)
const personId = ref<string | undefined>()
const person = computed(() => people.value?.find(p => p.id === personId.value) ?? null)
const personOptions = computed(() => (people.value ?? []).map(p => ({ label: p.full_name, value: p.id })))
const __s5 = useAsyncData('permission-overrides', async () => {
  const { data, error } = await supabase.from('permission_overrides').select('user_id, key, allowed')
  if (error) throw error
  return data
}, fresh)
await Promise.all([__s1, __s2, __s3, __s4, __s5])
const { data: roles, refresh: refreshRoles } = __s1
const { data: rows, refresh } = __s2
const { data: counts } = __s3
const { data: people } = __s4
const { data: overrides, refresh: refreshOverrides } = __s5
const overrideCount = (id: string) => (overrides.value ?? []).filter(o => o.user_id === id).length
const override = (key: string) => (overrides.value ?? []).find(o => o.user_id === personId.value && o.key === key)?.allowed
const OVERRIDE_OPTIONS = [{ label: 'Role default', value: 'default' }, { label: 'Allowed', value: 'yes' }, { label: 'Not allowed', value: 'no' }]
const overrideValue = (key: string) => { const v = override(key); return v === undefined ? 'default' : v ? 'yes' : 'no' }
async function setOverride(key: string, value: string) {
  if (!personId.value) return
  busy.value = `${personId.value}:${key}`
  try {
    const q = value === 'default'
      ? supabase.from('permission_overrides').delete().eq('user_id', personId.value).eq('key', key)
      : supabase.from('permission_overrides').upsert({ user_id: personId.value, key, allowed: value === 'yes' }, { onConflict: 'user_id,key' })
    const { error } = await q
    if (error) throw error
    await refreshOverrides()
  } catch (e) {
    toast.add({ title: 'Not saved', description: (e as Error).message, color: 'error' })
  } finally {
    busy.value = null
  }
}
const groups = [
  { label: 'Screens', items: SCREENS as readonly { key: string, label: string, hint: string }[] },
  { label: 'Actions', items: PERMISSIONS as readonly { key: string, label: string, hint: string }[] },
  { label: 'Money fields', items: FIELDS as readonly { key: string, label: string, hint: string }[] },
]
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
        <p class="text-sm text-muted">Which screens each role opens, what it may do, and which money fields it sees. Changes apply the next time that person loads a page. Admins can do everything. View as shows you the app the way a role or a person sees it.</p>
      </div>
      <SegmentedControl v-model="tab" :items="tabs" class="ml-auto" />
      <UButton icon="i-lucide-plus" @click="openAdd">New role</UButton>
    </div>

    <UCard v-if="tab !== 'people'" :ui="{ body: 'p-0 sm:p-0' }">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr class="border-b border-default">
              <th class="px-4 py-2 font-medium">{{ tab === 'screens' ? 'Screen' : tab === 'fields' ? 'Field' : 'Permission' }}</th>
              <th v-for="r in roles" :key="r.key" class="px-4 py-2 text-center font-medium" :title="r.description ?? ''">
                <button type="button" class="hover:underline" :title="r.is_builtin ? 'Rename' : 'Rename or delete'" @click="openEdit(r)">{{ r.label }}</button>
                <div class="text-[10px] font-normal text-dimmed">{{ counts?.[r.key] ?? 0 }} {{ (counts?.[r.key] ?? 0) === 1 ? 'person' : 'people' }}</div>
                <UButton v-if="r.key !== 'client'" size="xs" variant="ghost" color="neutral" icon="i-lucide-eye" class="mt-0.5" :title="`See Docket as ${article(r.label)} ${r.label.toLowerCase()}`" @click="viewAsRole(r)">View as</UButton>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in matrix" :key="p.key" class="border-b border-default last:border-0">
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
      <p v-if="tab === 'fields'" class="border-t border-default px-4 py-3 text-xs text-muted">A field only shows when the role also has "See rates and amounts" under Actions; that is what the database gates money on. These say which of that money the screens show.</p>
      <p v-else-if="tab === 'screens'" class="border-t border-default px-4 py-3 text-xs text-muted">Home, a task opened from a link, Account, Notifications and Help are always open. A screen that is on still hides what its permissions hide: Reports with nothing under "See everyone's time" is an empty page.</p>
    </UCard>

    <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center gap-3">
          <USelectMenu v-model="personId" :items="personOptions" value-key="value" class="w-64" placeholder="Pick a person" />
          <span v-if="person" class="text-sm text-muted">{{ roles?.find(r => r.key === person!.role)?.label ?? person.role }}<template v-if="overrideCount(person.id)">, {{ overrideCount(person.id) }} {{ overrideCount(person.id) === 1 ? 'override' : 'overrides' }}</template></span>
          <UButton v-if="person" size="xs" variant="outline" color="neutral" icon="i-lucide-eye" class="ml-auto" @click="viewAsPerson(person)">View as {{ person.full_name.split(' ')[0] }}</UButton>
        </div>
      </template>
      <div v-if="person && person.role === 'admin'" class="px-4 py-8 text-center text-sm text-muted">Admins have everything; there is nothing to grant or revoke.</div>
      <div v-else-if="person" class="divide-y divide-default text-sm">
        <div v-for="g in groups" :key="g.label">
          <div class="bg-elevated/40 px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-dimmed">{{ g.label }}</div>
          <div v-for="p in g.items" :key="p.key" class="flex items-center gap-4 px-4 py-2">
            <div class="min-w-0 flex-1">
              <div class="font-medium">{{ p.label }} <span class="text-xs font-normal text-muted">role says {{ has(person.role, p.key) ? 'yes' : 'no' }}</span></div>
              <div class="text-xs text-muted">{{ p.hint }}</div>
            </div>
            <USelect :model-value="overrideValue(p.key)" :items="OVERRIDE_OPTIONS" size="sm" class="w-36" :disabled="busy === `${person.id}:${p.key}`" @update:model-value="setOverride(p.key, $event as string)" />
          </div>
        </div>
      </div>
      <p v-else class="px-4 py-8 text-center text-sm text-muted">Pick a person to grant or take away one thing without changing their role. People with overrides: {{ (people ?? []).filter(p => overrideCount(p.id)).map(p => p.full_name).join(', ') || 'none yet' }}.</p>
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

    <AppDrawer :open="adding || !!editing" :title="editing ? `Edit ${editing.label}` : 'New role'" @update:open="(v) => { if (!v) { adding = false; editing = null } }">
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
    </AppDrawer>

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
