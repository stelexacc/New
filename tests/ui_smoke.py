"""Browser checks against an isolated Stelex demo server; uses explicitly mocked desktop/verification UI."""
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import argparse, json, os, shutil, uuid

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url',default='http://127.0.0.1:4318')
parser.add_argument('--admin-token-file',required=True)
args=parser.parse_args();base=args.base_url.rstrip('/')
root=Path(__file__).resolve().parents[1];shots=root/'test-results';shots.mkdir(exist_ok=True)
token=Path(args.admin_token_file).read_text().strip()
PASSWORD='browser-smoke-long-password'

def register(page,email,name='Browser Tester'):
    page.locator('.auth-screen-form [name="name"]').fill(name)
    page.locator('.auth-screen-form [name="email"]').fill(email)
    page.locator('.auth-screen-form [name="password"]').fill(PASSWORD)
    page.locator('.auth-screen-submit').click()
    expect(page.locator('.app-shell')).to_be_visible()

def nav(page,title):
    page.locator('.primary-nav button').filter(has_text=title).click()

def mint(context,**payload):
    result=context.request.post(base+'/api/admin/keys',headers={'Authorization':'Bearer '+token},data=payload)
    assert result.status==201,result.text()
    return result.json()['keys'][0]['code']

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('STELEX_CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
    page=context.new_page();errors=[];external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda req:external.append(req.url) if not req.url.startswith(base) and not req.url.startswith('blob:') else None)
    page.goto(base)
    expect(page.locator('.auth-screen')).to_be_visible()
    expect(page.locator('.auth-trial-note')).to_contain_text('Free Trial')
    assert page.locator('.app-shell').count()==0
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(shots/'auth-desktop.png'),full_page=True)
    email='ui-'+uuid.uuid4().hex+'@test.invalid';register(page,email)
    expect(page.locator('.topbar .plan-badge')).to_contain_text('Free Trial')
    expect(page.locator('.header-quota')).to_contain_text('100%')
    expect(page.locator('.header-credits strong')).to_have_text('0')
    expect(page.locator('.home-quota')).to_have_count(0)
    print('PASS full-screen registration gate and Free Trial percentage allowances')

    nav(page,'Credits')
    expect(page.locator('.plans-grid .pricing-card')).to_have_count(3)
    expect(page.locator('.free-plan .trial-art')).to_be_visible()
    assert page.locator('.trial-art').evaluate('(e)=>e.complete && e.naturalWidth>0')
    for amount in ['7,99','14,99','29,99']: assert amount in page.locator('.plans-grid').inner_text()
    assert all(href=='https://discord.gg/stelex' for href in page.locator('.plans-grid a,.credit-packs a').evaluate_all('(xs)=>xs.map(x=>x.href)'))
    page.set_viewport_size({'width':1440,'height':1700})
    page.screenshot(path=str(shots/'plans-desktop.png'),full_page=True)
    page.set_viewport_size({'width':1440,'height':1000})
    print('PASS three paid tariff cards, separate Free Trial local artwork, prices and manual purchase links')

    credit_code=mint(context,credits=137,count=1,note='UI smoke credit sale')
    page.locator('#credit-code').fill(credit_code);page.get_by_role('button',name='Code einlösen',exact=True).click()
    expect(page.locator('.inline-success')).to_contain_text('137')
    expect(page.locator('.header-credits strong')).to_have_text('137')
    page.locator('#credit-code').fill(credit_code);page.get_by_role('button',name='Code einlösen',exact=True).click()
    expect(page.locator('.inline-error')).to_be_visible()
    expect(page.locator('.header-credits strong')).to_have_text('137')
    plan_code=mint(context,type='plan',planId='pro',durationDays=30,count=1,note='UI smoke Pro sale')
    page.locator('#credit-code').fill(plan_code);page.get_by_role('button',name='Code einlösen',exact=True).click()
    expect(page.locator('.inline-success')).to_contain_text('Pro')
    expect(page.locator('.topbar .plan-badge')).to_contain_text('Pro')
    expect(page.locator('.membership-summary')).to_contain_text('Pro')
    print('PASS exact top-up, duplicate rejection, Pro activation and visible badge')

    nav(page,'Chat');prompt='Erkläre eine Python-Funktion.'
    page.get_by_placeholder('Frag Stelex GPT etwas …').fill(prompt)
    page.get_by_role('button',name='Nachricht senden',exact=True).click()
    expect(page.locator('.message-assistant .markdown')).to_contain_text('Demomodus')
    expect(page.locator('.header-credits strong')).to_have_text('137')
    page.reload();expect(page.locator('.conversation-link')).to_have_count(1)
    page.locator('.conversation-link').click();expect(page.locator('.message')).to_have_count(2)
    with page.expect_download() as download_info:page.get_by_role('button',name='Chat exportieren',exact=True).click()
    assert prompt in Path(download_info.value.path()).read_text()
    print('PASS free demo reply, persistent chat and actual Markdown download')

    # Force non-zero quota solely to exercise countdown rendering in free demo UI.
    def measured_quota(route):
        response=route.fetch();data=response.json()
        for key in ['short','week']:
            data['quota'][key]['usedPercent']=50;data['quota'][key]['remainingPercent']=50
            data['quota'][key]['used']=data['quota'][key]['limit']/2
        route.fulfill(response=response,json=data)
    page.route('**/api/me',measured_quota);page.reload();nav(page,'Verbrauch')
    expect(page.locator('.quota-panel time')).to_have_count(2)
    before=page.locator('.quota-panel time').first.inner_text();page.wait_for_timeout(1100)
    assert page.locator('.quota-panel time').first.inner_text()!=before
    assert all(v==50 for v in page.locator('.quota-panel [role="progressbar"]').evaluate_all('(xs)=>xs.map(e=>Number(e.getAttribute("aria-valuenow")))'))
    assert 'Tokens' not in page.locator('.usage-page').inner_text()
    page.screenshot(path=str(shots/'usage-desktop.png'),full_page=True)
    page.unroute('**/api/me',measured_quota)
    page.locator('.sidebar-language').get_by_role('button',name='EN',exact=True).click()
    expect(page.locator('.usage-page')).to_contain_text('Know where you stand.')
    page.reload();expect(page.locator('.sidebar-language button.active')).to_have_text('EN')
    print('PASS usage percentage meters, live independent countdowns, DE/EN persistence')

    nav(page,'Chat')
    page.get_by_role('button',name='New chat',exact=False).first.click()
    def drop_success_response(route):route.fetch();route.abort('failed')
    page.route('**/api/chat',drop_success_response)
    page.get_by_placeholder('Ask Stelex GPT anything …').fill('Answer once despite transport loss.')
    page.get_by_role('button',name='Send message',exact=True).click()
    expect(page.get_by_placeholder('Ask Stelex GPT anything …')).to_have_value('Answer once despite transport loss.')
    before=context.request.get(base+'/api/me').json()['usage']['responses']
    page.unroute('**/api/chat',drop_success_response)
    page.get_by_role('button',name='Send message',exact=True).click()
    expect(page.locator('.message-assistant .markdown')).to_contain_text('demo mode')
    assert context.request.get(base+'/api/me').json()['usage']['responses']==before
    print('PASS response transport loss retry retains one answer and no double charge')

    # Mock only the native bridge; file safety is covered by Node filesystem tests.
    desktop=browser.new_context(viewport={'width':1440,'height':1000},storage_state=context.storage_state())
    desktop.add_init_script("""window.qaSaved=[];window.qaFolder=null;window.stelexDesktop={getOutputDirectory:async()=>({path:window.qaFolder}),chooseOutputDirectory:async()=>{window.qaFolder='C:\\\\Users\\\\QA\\\\Desktop\\\\Stelex';return{path:window.qaFolder}},saveArtifact:async(value)=>{window.qaSaved.push(value);return{path:window.qaFolder+'\\\\'+value.name,name:value.name}}};""")
    d=desktop.new_page();d.on('pageerror',lambda e:errors.append(str(e)));d.goto(base)
    d.locator('.output-folder button').click();expect(d.locator('.output-folder-path')).to_contain_text('Desktop')
    def code_response(route):
        response=route.fetch();data=response.json();data['message']['content']='```python\nprint("saved")\n```';route.fulfill(response=response,json=data)
    d.route('**/api/chat',code_response)
    d.get_by_placeholder('Ask Stelex GPT anything …').fill('Create Python code to save.')
    d.get_by_role('button',name='Send message',exact=True).click()
    expect(d.locator('.code-downloads button')).to_have_count(1)
    d.locator('.code-downloads button').click()
    expect(d.locator('.toast')).to_contain_text('File saved')
    artifact=d.evaluate('window.qaSaved[0]');assert artifact['name'].endswith('.py') and 'print("saved")' in artifact['content']
    d.get_by_role('button',name='Export chat',exact=True).click()
    assert d.evaluate('window.qaSaved.length')==2
    print('PASS mocked desktop folder selection, Python artifact save and chat export')

    # Exercise optional verification screens with mocked transport, not real email.
    verify=browser.new_context(viewport={'width':1440,'height':1000});v=verify.new_page();account={}
    def register_pending(route):
        response=route.fetch();account.update(response.json());account['verificationRequired']=True;account['verificationEnabled']=True;account['user']['emailVerified']=False;route.fulfill(response=response,json=account)
    def pending_me(route):
        if account:route.fulfill(status=200,json=account)
        else:route.fulfill(status=401,json={'code':'AUTH_REQUIRED','error':'Sign in'})
    def verify_code(route):
        if route.request.post_data_json.get('code')!='123456':route.fulfill(status=400,json={'code':'INVALID_VERIFICATION_CODE','error':'Invalid code'})
        else:account['verificationRequired']=False;account['user']['emailVerified']=True;route.fulfill(status=200,json=account)
    v.route('**/api/me',pending_me);v.route('**/api/auth/register',register_pending);v.route('**/api/auth/verify',verify_code)
    v.route('**/api/auth/resend',lambda route:route.fulfill(status=200,json={'ok':True}))
    v.goto(base);v.locator('[name="name"]').fill('Verification QA');v.locator('[name="email"]').fill('verify-ui-'+uuid.uuid4().hex+'@test.invalid');v.locator('[name="password"]').fill(PASSWORD);v.locator('.auth-screen-submit').click()
    expect(v.locator('.verification-code')).to_be_visible();v.locator('.verification-code').fill('000000');v.locator('.auth-screen-submit').click();expect(v.locator('.inline-error')).to_be_visible()
    v.get_by_role('button',name='Code erneut senden',exact=True).click();expect(v.locator('.inline-success')).to_be_visible()
    v.locator('.verification-code').fill('123456');v.locator('.auth-screen-submit').click();expect(v.locator('.app-shell')).to_be_visible()
    print('PASS mocked optional verification UI: invalid code, resend, successful unlock')

    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    m=mobile.new_page();m.on('pageerror',lambda e:errors.append(str(e)));m.goto(base);expect(m.locator('.auth-screen')).to_be_visible()
    assert m.evaluate('document.documentElement.scrollWidth <= innerWidth')
    m.screenshot(path=str(shots/'auth-mobile.png'),full_page=True)
    m.locator('.auth-tabs').get_by_role('button',name='Anmelden',exact=True).click();m.locator('[name="email"]').fill(email);m.locator('[name="password"]').fill(PASSWORD);m.locator('.auth-screen-submit').click();expect(m.locator('.app-shell')).to_be_visible()
    m.get_by_role('button',name='Menü öffnen',exact=True).click();nav(m,'Credits');expect(m.locator('.plans-grid .pricing-card')).to_have_count(3)
    assert m.evaluate('document.documentElement.scrollWidth <= innerWidth'),m.evaluate('[document.documentElement.scrollWidth,innerWidth]')
    m.wait_for_function("() => document.querySelector('.sidebar').getBoundingClientRect().right <= 1")
    m.screenshot(path=str(shots/'plans-mobile.png'),full_page=True)
    print('PASS mobile390px auth, login, menu, plans and zero horizontal overflow')
    assert not errors,errors
    assert not external,external
    print('PASS zero JavaScript exceptions and zero external loading dependencies')
    browser.close()
