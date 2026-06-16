import re

path = r'D:\Devlopment\workspace\personal\projects\tonia-travel-guide\zibo\index.html'
with open(path, 'r', encoding='utf-8') as f:
    h = f.read()

# Target: <a href="javascript:void(0)" onclick="openApp(\'ctrip://\',\'URL\')" class="book-btn ctrip">
# The backslash+quote in the HTML source is: \\'ctrip://\\',\\'URL\\'
# In Python string repr, that's literally: \'ctrip://\',\'URL\'

def repl(m):
    # Extract URL from the onclick attribute
    onclick = m.group(0)
    # Find the second argument in onclick
    start = onclick.find(",","ctrip://")
    if start == -1:
        start = onclick.find(",\\")
    url_start = onclick.index(":","ctrip://")
    
    # Simpler: just match everything between the last ' '' and '' ) 
    parts = onclick.split("','")
    if len(parts) >= 2:
        url = parts[1].rstrip("')")
        return f'<a href="{url}" target="_blank" class="book-btn ctrip">携程预订'
    return m.group(0)

# Pattern: <a href="javascript:void(0)" onclick="openApp(...)" class="book-btn ctrip">携程预订</a>
pattern = r'<a href="javascript:void\(0\)" onclick="openApp\([^)]+\)" class="book-btn ctrip">携程预订</a>'
h = re.sub(pattern, repl, h)

# Also remove remaining Meituan and openApp function if present
h = re.sub(r'\s*<a href="javascript:void\(0\)" onclick="openApp\([^)]+\)" class="book-btn meituan">美团预订</a>', '', h)
h = re.sub(r'\n\s*function openApp.*?\n\s*\}', '', h, flags=re.DOTALL)
h = re.sub(r'\.book-btn\.meituan\{[^}]*\}\s*', '', h)
h = re.sub(r'\.book-btn\.meituan:hover\{[^}]*\}\s*', '', h)
h = re.sub(r'@media\(max-width:767px\)\{\.book-btn\.meituan\{display:block\}\}\s*', '', h)

with open(path, 'w', encoding='utf-8') as f:
    f.write(h)

print('openApp:', h.count('openApp'))
print('meituan:', h.count('meituan'))
print('ctrip:', len(re.findall(r'class="book-btn ctrip"', h)))
