const fs = require('fs');

const enPath = 'lib/i18n/cold/en.ts';
const guPath = 'lib/i18n/cold/gu.ts';

let enContent = fs.readFileSync(enPath, 'utf8');
let guContent = fs.readFileSync(guPath, 'utf8');

const enStaff = `
  staff: {
    pageTitle: 'Staff Management',
    addStaff: 'Add Staff',
    name: 'Name',
    email: 'Email',
    status: 'Status',
    actions: 'Actions',
    noStaffFound: 'No staff members found.',
    editStaff: 'Edit Staff',
    fullName: 'Full Name',
    phoneNumber: 'Phone Number',
    loginId: 'Email (Login ID)',
    password: 'Password',
    permissions: 'Permissions',
    module: 'Module',
    cancel: 'Cancel',
    save: 'Save',
    resetPasswordTitle: 'Reset Password',
    newPassword: 'New Password',
    update: 'Update',
    loadingStaff: 'Loading staff...',
    failedToLoad: 'Failed to load staff',
    updatedSuccess: 'Staff updated successfully',
    createdSuccess: 'Staff created successfully',
    failedToSave: 'Failed to save staff',
    deleteConfirm: 'Are you sure you want to delete this staff member?',
    enterNewPassword: 'Enter new password',
    passwordResetSuccess: 'Password reset successfully',
    modules: {
      dashboard: 'Dashboard',
      warehouse: 'Warehouse Master',
      commodity: 'Commodity Master',
      inward: 'Inward Transaction',
      outward: 'Outward Transaction',
      ledger: 'Client Ledger',
      invoice: 'Invoice',
      reports: 'Reports',
      clientMaster: 'Client Master',
      floorMapping: 'Floor Mapping'
    },
    actionsList: {
      view: 'View',
      create: 'Create',
      edit: 'Edit',
      delete: 'Delete',
      print: 'Print',
      approve: 'Approve'
    }
  },`;

const guStaff = `
  staff: {
    pageTitle: 'સ્ટાફ મેનેજમેન્ટ',
    addStaff: 'સ્ટાફ ઉમેરો',
    name: 'નામ',
    email: 'ઇમેઇલ',
    status: 'સ્ટેટસ',
    actions: 'ક્રિયાઓ',
    noStaffFound: 'કોઈ સ્ટાફ મળ્યો નથી.',
    editStaff: 'સ્ટાફ અપડેટ કરો',
    fullName: 'પૂરું નામ',
    phoneNumber: 'ફોન નંબર',
    loginId: 'ઇમેઇલ (લોગિન ID)',
    password: 'પાસવર્ડ',
    permissions: 'પરવાનગીઓ',
    module: 'મોડ્યુલ',
    cancel: 'રદ કરો',
    save: 'સાચવો',
    resetPasswordTitle: 'પાસવર્ડ રિસેટ કરો',
    newPassword: 'નવો પાસવર્ડ',
    update: 'અપડેટ કરો',
    loadingStaff: 'સ્ટાફ લોડ થઈ રહ્યો છે...',
    failedToLoad: 'સ્ટાફ લોડ કરવામાં નિષ્ફળ',
    updatedSuccess: 'સ્ટાફ સફળતાપૂર્વક અપડેટ થયો',
    createdSuccess: 'સ્ટાફ સફળતાપૂર્વક ઉમેરવામાં આવ્યો',
    failedToSave: 'સ્ટાફ સાચવવામાં નિષ્ફળ',
    deleteConfirm: 'શું તમે ખરેખર આ સ્ટાફને કાઢી નાખવા માંગો છો?',
    enterNewPassword: 'નવો પાસવર્ડ દાખલ કરો',
    passwordResetSuccess: 'પાસવર્ડ સફળતાપૂર્વક રિસેટ થયો',
    modules: {
      dashboard: 'ડેશબોર્ડ',
      warehouse: 'ગોડાઉન માસ્ટર',
      commodity: 'કોમોડિટી માસ્ટર',
      inward: 'આવક ટ્રાન્ઝેક્શન',
      outward: 'જાવક ટ્રાન્ઝેક્શન',
      ledger: 'ગ્રાહક ખાતાવહી',
      invoice: 'બિલિંગ',
      reports: 'રિપોર્ટ',
      clientMaster: 'ગ્રાહક માસ્ટર',
      floorMapping: 'ફ્લોર મેપિંગ'
    },
    actionsList: {
      view: 'જુઓ',
      create: 'બનાવો',
      edit: 'ફેરફાર',
      delete: 'ડીલીટ',
      print: 'પ્રિન્ટ',
      approve: 'મંજૂરી'
    }
  },`;

if (!enContent.includes('staff: {')) {
  enContent = enContent.replace('export const en: Dictionary = {', 'export const en: Dictionary = {' + enStaff);
  fs.writeFileSync(enPath, enContent);
}
if (!guContent.includes('staff: {')) {
  guContent = guContent.replace('export const gu: Dictionary = {', 'export const gu: Dictionary = {' + guStaff);
  fs.writeFileSync(guPath, guContent);
}

const pathTsx = 'components/features/cold-staff/staff-management.tsx';
let content = fs.readFileSync(pathTsx, 'utf8');

// 1. Import useColdTranslation
if (!content.includes('useColdTranslation')) {
  content = content.replace(
    "import { PermissionModule } from '@/lib/permissions';",
    "import { PermissionModule } from '@/lib/permissions';\nimport { useColdTranslation } from '@/components/providers/cold-language-provider';"
  );
}

// 2. Add useColdTranslation hook inside the component
if (!content.includes('const { t } = useColdTranslation();')) {
  content = content.replace(
    'export default function StaffManagement() {',
    'export default function StaffManagement() {\n  const { t } = useColdTranslation();'
  );
}

// 3. Replace MODULES
content = content.replace(
  /const MODULES: \{ id: PermissionModule; label: string \}\[\] = \[[\s\S]*?\];/,
  \`const MODULES: { id: PermissionModule; key: string }[] = [
  { id: 'dashboard', key: 'dashboard' },
  { id: 'warehouse', key: 'warehouse' },
  { id: 'commodity', key: 'commodity' },
  { id: 'inward', key: 'inward' },
  { id: 'outward', key: 'outward' },
  { id: 'ledger', key: 'ledger' },
  { id: 'invoice', key: 'invoice' },
  { id: 'reports', key: 'reports' },
  { id: 'clientMaster', key: 'clientMaster' },
  { id: 'floorMapping', key: 'floorMapping' },
];\`
);

// 4. Update the usage of MODULES and ACTIONS
// For actions header:
content = content.replace(
  /\{ACTIONS\.map\(act => \(\n\s*<th key=\{act\} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">\{act\}<\/th>\n\s*\)\)\}/,
  \`{ACTIONS.map(act => (
                            <th key={act} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">{t(\\\`staff.actionsList.\${act}\\\`)}</th>
                          ))}\`
);

// For modules label:
content = content.replace(
  /<td className="px-4 py-2 text-sm font-medium text-gray-900">\{mod\.label\}<\/td>/,
  \`<td className="px-4 py-2 text-sm font-medium text-gray-900">{t(\\\`staff.modules.\${mod.key}\\\`)}</td>\`
);

// 5. Replace text strings
const replacements = [
  [/alert\\('Failed to load staff'\\)/g, "alert(t('staff.failedToLoad'))"],
  [/alert\\('Staff updated successfully'\\)/g, "alert(t('staff.updatedSuccess'))"],
  [/alert\\('Staff created successfully'\\)/g, "alert(t('staff.createdSuccess'))"],
  [/alert\\(error\\.message \\|\\| 'Failed to save staff'\\)/g, "alert(error.message || t('staff.failedToSave'))"],
  [/if \\(!confirm\\('Are you sure you want to delete this staff member\\?'\\)\\) return;/g, "if (!confirm(t('staff.deleteConfirm'))) return;"],
  [/if \\(!newPassword\\) return alert\\('Enter new password'\\);/g, "if (!newPassword) return alert(t('staff.enterNewPassword'));"],
  [/alert\\('Password reset successfully'\\)/g, "alert(t('staff.passwordResetSuccess'))"],
  [/<div>Loading staff\\.\\.\\.<\\/div>/g, "<div>{t('staff.loadingStaff')}</div>"],
  [/<h1 className="text-2xl font-bold text-gray-900">Staff Management<\\/h1>/g, "<h1 className=\\"text-2xl font-bold text-gray-900\\">{t('staff.pageTitle')}</h1>"],
  [/> Add Staff\\n\\s*<\\/button>/g, "> {t('staff.addStaff')}\\n        </button>"],
  [/<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name<\\/th>/g, "<th className=\\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\\">{t('staff.name')}</th>"],
  [/<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email<\\/th>/g, "<th className=\\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\\">{t('staff.email')}</th>"],
  [/<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status<\\/th>/g, "<th className=\\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\\">{t('staff.status')}</th>"],
  [/<th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions<\\/th>/g, "<th className=\\"px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider\\">{t('staff.actions')}</th>"],
  [/>No staff members found\\.<\\/td>/g, ">{t('staff.noStaffFound')}</td>"],
  [/<h2 className="text-xl font-bold mb-4">\\{editingStaff \\? 'Edit Staff' : 'Add Staff'\\}<\\/h2>/g, "<h2 className=\\"text-xl font-bold mb-4\\">{editingStaff ? t('staff.editStaff') : t('staff.addStaff')}</h2>"],
  [/<label className="block text-sm font-medium text-gray-700">Full Name<\\/label>/g, "<label className=\\"block text-sm font-medium text-gray-700\\">{t('staff.fullName')}</label>"],
  [/<label className="block text-sm font-medium text-gray-700">Phone Number<\\/label>/g, "<label className=\\"block text-sm font-medium text-gray-700\\">{t('staff.phoneNumber')}</label>"],
  [/<label className="block text-sm font-medium text-gray-700">Email \\(Login ID\\)<\\/label>/g, "<label className=\\"block text-sm font-medium text-gray-700\\">{t('staff.loginId')}</label>"],
  [/<label className="block text-sm font-medium text-gray-700">Password<\\/label>/g, "<label className=\\"block text-sm font-medium text-gray-700\\">{t('staff.password')}</label>"],
  [/<h3 className="text-lg font-medium text-gray-900 mb-4">Permissions<\\/h3>/g, "<h3 className=\\"text-lg font-medium text-gray-900 mb-4\\">{t('staff.permissions')}</h3>"],
  [/<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Module<\\/th>/g, "<th className=\\"px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase\\">{t('staff.module')}</th>"],
  [/>Cancel<\\/button>/g, ">{t('staff.cancel')}</button>"],
  [/>Save<\\/button>/g, ">{t('staff.save')}</button>"],
  [/<h2 className="text-lg font-bold mb-4">Reset Password<\\/h2>/g, "<h2 className=\\"text-lg font-bold mb-4\\">{t('staff.resetPasswordTitle')}</h2>"],
  [/<label className="block text-sm font-medium text-gray-700">New Password<\\/label>/g, "<label className=\\"block text-sm font-medium text-gray-700\\">{t('staff.newPassword')}</label>"],
  [/>Update<\\/button>/g, ">{t('staff.update')}</button>"]
];

replacements.forEach(([regex, replace]) => {
  content = content.replace(regex, replace);
});

fs.writeFileSync(pathTsx, content);
console.log('Done updating translations');
