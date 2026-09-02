<script setup lang="ts">
// Settings that apply to every project. Just the server folder template
// for now. It shares the one-row invoice_settings table.
definePageMeta({ middleware: 'admin' })
useHead({ title: 'Project settings' })

const supabase = useSupabaseClient()
const toast = useToast()

const { data: settings } = await useAsyncData('project-settings', async () => {
  const { data, error } = await supabase.from('invoice_settings').select('project_folder_template').eq('id', true).single()
  if (error) throw error
  return data
}, fresh)

const template = ref(settings.value?.project_folder_template ?? '')
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const { error } = await supabase.from('invoice_settings').update({ project_folder_template: template.value.trim() || null }).eq('id', true)
    if (error) throw error
    toast.add({ title: 'Project settings saved', color: 'success' })
  } catch (e) {
    toast.add({ title: 'Could not save', description: (e as Error).message, color: 'error' })
  } finally {
    saving.value = false
  }
}

const examples = computed(() => folderRoots(template.value || 'smb://server/CLIENTS/{client}').map(r => ({
  label: r.label,
  path: fillFolderTemplate(r.value, { client: 'Hills Bank', code: '1234', name: 'Spring mailer' }),
})))
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Project settings</h1>
      <p class="text-sm text-muted">Where project folders live on the office server.</p>
    </div>

    <UCard>
      <template #header><h2 class="font-semibold">Server folders</h2></template>
      <div class="space-y-4">
        <UFormField label="Folder roots" help="One per line, one for each volume that holds project folders. Stop at {client} when project folders are named by hand; add {code} and {name} only if they follow a pattern.">
          <UTextarea v-model="template" :rows="3" class="w-full font-mono" placeholder="smb://server/CLIENTS/{client}&#10;smb://server/WEB/{client}" />
        </UFormField>
        <div class="space-y-1 text-sm text-muted">
          <p>A new project for Hills Bank starts at:</p>
          <p v-for="e in examples" :key="e.label" class="flex gap-2"><span class="w-24 shrink-0 font-medium">{{ e.label }}</span><span class="font-mono">{{ e.path }}</span></p>
          <p>With more than one root, the project form gets a volume picker. Drop the project's folder from Finder onto the field, or choose it, and its name is added under the client's folder. Task file links start at the project folder.</p>
        </div>
      </div>
    </UCard>

    <div class="flex justify-end">
      <UButton :loading="saving" @click="save">Save settings</UButton>
    </div>
  </div>
</template>
