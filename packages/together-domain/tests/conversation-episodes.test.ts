import{describe,expect,it}from'vitest';
import{buildConversationChapter,buildConversationEpisode,shouldRetrieveConversationEpisodes}from'../src/conversation-episodes.ts';

describe('conversation episodes',()=>{
  it('preserves immutable speaker attribution and source ranges',()=>{
    const episode=buildConversationEpisode([
      {id:'m1',role:'user',content:'The lighthouse dinner was my favorite date.',createdAt:'2026-01-01T00:00:00Z',sequence:41},
      {id:'m2',role:'assistant',content:'I loved how the storm rolled in over the harbor.',createdAt:'2026-01-01T00:01:00Z',sequence:42,speakerName:'Chloe',speakerCharacterInstanceId:'c1'},
      {id:'m3',role:'assistant',content:'You both looked soaked when you came back.',createdAt:'2026-01-01T00:02:00Z',sequence:43,speakerName:'Miya',speakerCharacterInstanceId:'c2'},
    ]);
    expect(episode).toMatchObject({startSequence:41,endSequence:43,startMessageId:'m1',endMessageId:'m3',messageCount:3,participantCharacterInstanceIds:['c1','c2']});
    expect(episode?.attributedSummary).toContain('Chloe [c1]');
    expect(episode?.attributedSummary).toContain('Miya [c2]');
  });
  it('keeps casual greetings out of long-history retrieval',()=>{
    expect(shouldRetrieveConversationEpisodes('hey')).toBe(false);
    expect(shouldRetrieveConversationEpisodes('What are you doing tonight?')).toBe(false);
    expect(shouldRetrieveConversationEpisodes('Remember our lighthouse dinner?')).toBe(true);
    expect(shouldRetrieveConversationEpisodes('That lighthouse dinner was wonderful')).toBe(true);
  });
  it('rolls immutable episodes into a source-addressable chapter',()=>{
    const base={title:'Harbor evening',summary:'They discussed staying in town.',attributedSummary:'USER: I may stay.\nChloe [c1]: I hope you do.',topicTerms:['harbor','staying'],participantCharacterInstanceIds:['c1'],startMessageId:'m1',endMessageId:'m24',messageCount:24};
    const chapter=buildConversationChapter([
      {...base,id:'e1',startSequence:1,endSequence:24},
      {...base,id:'e2',startSequence:25,endSequence:48,startMessageId:'m25',endMessageId:'m48',topicTerms:['harbor','future']},
    ]);
    expect(chapter).toMatchObject({startSequence:1,endSequence:48,messageCount:48,sourceEpisodeIds:['e1','e2'],participantCharacterInstanceIds:['c1']});
    expect(chapter?.topicTerms[0]).toBe('harbor');
  });
});
