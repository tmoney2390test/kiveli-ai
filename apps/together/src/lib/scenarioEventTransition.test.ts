import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./api',()=>({invoke:vi.fn(),ApiError:class extends Error {constructor(message:string,public code:string){super(message);}}}));
vi.mock('./dialogs',()=>({confirmAction:vi.fn()}));
import {ApiError,invoke} from './api';
import {confirmAction} from './dialogs';
import {joinCommitment} from './commitments';
beforeEach(()=>vi.resetAllMocks());
it('does not join or pause when the user declines the transition',async()=>{
 vi.mocked(invoke).mockRejectedValueOnce(new ApiError('Pause required','SCENARIO_PAUSE_REQUIRED'));
 vi.mocked(confirmAction).mockImplementation(options=>options.onCancel?.());
 await expect(joinCommitment('plan','character','request')).rejects.toMatchObject({code:'ACTION_CANCELLED'});
 expect(invoke).toHaveBeenCalledTimes(1);
 expect(invoke).toHaveBeenCalledWith('together-plan',{action:'join',planId:'plan',characterInstanceId:'character',requestId:'request'});
});
it('requires confirmation and preserves the request identity when joining',async()=>{
 vi.mocked(invoke).mockRejectedValueOnce(new ApiError('Pause required','SCENARIO_PAUSE_REQUIRED')).mockResolvedValueOnce({planId:'plan'});
 vi.mocked(confirmAction).mockImplementation(options=>{void options.onConfirm();});
 await expect(joinCommitment('plan','character','request')).resolves.toEqual({planId:'plan'});
 expect(invoke).toHaveBeenLastCalledWith('together-plan',{action:'join',planId:'plan',characterInstanceId:'character',requestId:'request',pauseScenario:true});
});
