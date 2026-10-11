import { render, screen, waitFor } from '@testing-library/react';
import ShellApp from './ShellApp';
import type { ShellContext } from './shell-contract';

vi.mock('./components/pages/PCBPrinterPage', () => ({ default: () => <div>pcb printer</div> }));

test('renders the sandbox tabs and asks the shell for sandbox credentials', async () => {
    const getAwsCredentials = vi.fn(async () => ({ accessKeyId: 'a', secretAccessKey: 's', sessionToken: 't', expiration: new Date() }));
    render(<ShellApp {...({ env: 'sandbox', basePath: '/sandbox', getAwsCredentials } as unknown as ShellContext)} />);
    expect(screen.getByRole('tab', { name: 'PCB Printer' })).toBeInTheDocument();
    await waitFor(() => expect(getAwsCredentials).toHaveBeenCalledWith('eu-west-2:f7fcd995-522d-4034-89d4-3ffff91da0bb'));
});
