/** Temporary, server-enforced owner preview. This ID grants no authority by itself. */
export const CHARACTER_BLUEPRINT_TEST_USER = '0aaaa97b-a210-4d06-893a-7780bed71927';
export const canPreviewCharacterBlueprint = (userId: string | undefined) => userId === CHARACTER_BLUEPRINT_TEST_USER;
export type CharacterBlueprint = { name: string; version: number; sections: Array<{title: string; data: unknown}> };
