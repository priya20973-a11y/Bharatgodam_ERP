const fs = require('fs');
const path = 'app/cold/profile/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const fieldsToWrap = [
  't(\'profile.companyName\')',
  't(\'profile.companyLogo\')',
  'Logo Preview',
  't(\'profile.address\')',
  't(\'profile.warehouseLocation\')',
  't(\'profile.state\')',
  't(\'profile.gstNumber\')',
  't(\'profile.bankName\')',
  't(\'profile.accountName\')',
  't(\'profile.accountNumber\')',
  't(\'profile.ifsc\')',
  't(\'profile.branch\')'
];

for(const f of fieldsToWrap) {
  const searchStr = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  if (f === 't(\'profile.gstNumber\')') {
    // Custom match for GST
    const gstRegex = /<div className="space-y-2">\s*<div className="flex items-center justify-between">[\s\S]*?<\/div>\s*<input type="text" disabled=\{gstNotApplicable\}[^>]*>\s*<\/div>/g;
    content = content.replace(gstRegex, (match) => {
      if(match.includes("{profile?.role !== 'STAFF' && (")) return match;
      return `{profile?.role !== 'STAFF' && (\n${match}\n)}`;
    });
  } else if (f === 'Logo Preview') {
    const logoRegex = /<div className="space-y-2">\s*<span className="text-sm font-medium text-slate-700">Logo Preview<\/span>[\s\S]*?<\/div>\s*<\/div>/g;
    content = content.replace(logoRegex, (match) => {
      if(match.includes("{profile?.role !== 'STAFF' && (")) return match;
      return `{profile?.role !== 'STAFF' && (\n${match}\n)}`;
    });
  } else {
    // Normal label match
    const regex = new RegExp(`<label className="space-y-2">[\\s\\S]*?${searchStr}[\\s\\S]*?</label>`, 'g');
    content = content.replace(regex, (match) => {
      if(match.includes("{profile?.role !== 'STAFF' && (")) return match;
      return `{profile?.role !== 'STAFF' && (\n${match}\n)}`;
    });
  }
}

fs.writeFileSync(path, content);
console.log('Successfully updated profile page');
